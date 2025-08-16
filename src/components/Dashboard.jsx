import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FiSend, FiLogOut, FiMenu, FiX, FiSearch, FiImage, FiPaperclip, FiEdit, FiTrash2 } from 'react-icons/fi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [editingMessage, setEditingMessage] = useState(null);

  // Fetch users with online status
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/users`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        const data = await response.json();
        if (data.success) {
          const usersWithStatus = await Promise.all(
            data.users.map(async (user) => {
              try {
                const statusResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/online-status/${user._id}`, {
                  credentials: 'include',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                  }
                });
                const statusData = await statusResponse.json();
                return { ...user, online: statusData.isOnline };
              } catch (err) {
                console.error('Error checking online status:', err);
                return { ...user, online: false };
              }
            })
          );
          setUsers(usersWithStatus || []);
        } else {
          toast.error(data.message || 'Failed to fetch users');
        }
      } catch (err) {
        toast.error('Failed to fetch users');
      }
    };
    fetchUsers();
  }, []);

  // Fetch messages when user is selected
  useEffect(() => {
    if (selectedUser) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/messages/${selectedUser._id}`, {
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });

          const data = await response.json();
          if (data.success) {
            setMessages(data.messages || []);
          } else {
            setMessages([]);
            toast.error(data.message || 'Failed to fetch messages');
          }
        } catch (err) {
          setMessages([]);
          toast.error('Failed to fetch messages');
        }
      };
      fetchMessages();
    }
  }, [selectedUser]);

  // Socket.io event listeners
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message) => {
      setMessages(prev => [...prev, message]);
    };

    const handleTyping = ({ senderId, isTyping }) => {
      if (selectedUser && senderId === selectedUser._id) {
        setIsTyping(isTyping);
      }
    };

    const handleOnlineStatus = ({ userId, isOnline }) => {
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === userId ? { ...user, online: isOnline } : user
        )
      );
      
      if (selectedUser?._id === userId) {
        setSelectedUser(prev => ({ ...prev, online: isOnline }));
      }
    };

    const handleMessageEdited = (updatedMessage) => {
      setMessages(prev => 
        prev.map(msg => 
          msg._id === updatedMessage._id ? { ...updatedMessage, edited: true } : msg
        )
      );
      toast.success('Message updated');
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(msg => msg._id !== messageId));
      toast.success('Message deleted');
    };

    const handleEditError = ({ error, messageId }) => {
      toast.error(error);
      setEditingMessage(null);
    };

    const handleDeleteError = ({ error }) => {
      toast.error(error);
    };

    socket.on('private-message', handleMessage);
    socket.on('typing', handleTyping);
    socket.on('user-online-status', handleOnlineStatus);
    socket.on('message-updated', handleMessageEdited);
    socket.on('message-deleted', handleMessageDeleted);
    socket.on('edit-error', handleEditError);
    socket.on('delete-error', handleDeleteError);

    return () => {
      socket.off('private-message', handleMessage);
      socket.off('typing', handleTyping);
      socket.off('user-online-status', handleOnlineStatus);
      socket.off('message-updated', handleMessageEdited);
      socket.off('message-deleted', handleMessageDeleted);
      socket.off('edit-error', handleEditError);
      socket.off('delete-error', handleDeleteError);
    };
  }, [socket, selectedUser]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size should be less than 5MB');
        return;
      }
      
      if (!file.type.match('image.*')) {
        toast.error('Only image files are allowed');
        return;
      }

      setAttachment(file);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachmentPreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || !selectedUser || !socket) return;
    
    setIsSending(true);
    let tempId = `temp_${Date.now()}`;
    const tempMessage = {
      _id: tempId,
      sender: user,
      content: newMessage,
      attachment: attachment ? {
        url: attachmentPreview,
        type: 'image',
        name: attachment.name
      } : null,
      createdAt: new Date().toISOString(),
      optimistic: true
    };

    // Optimistic update
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      let formData = new FormData();
      formData.append('receiverId', selectedUser._id);
      formData.append('content', newMessage);
      if (attachment) {
        formData.append('attachment', attachment);
      }

      if (attachment) {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/messages`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to send message');
        }

        setMessages(prev => prev.map(msg => 
          msg._id === tempId ? { ...data.message, optimistic: false } : msg
        ));
      } else {
        socket.emit('private-message', {
          receiverId: selectedUser._id,
          content: newMessage
        });
      }
    } catch (err) {
      toast.error('Failed to send message');
      setMessages(prev => prev.filter(msg => msg._id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const handleEditMessage = async (messageId, newContent) => {
  if (!newContent.trim() || !socket || !selectedUser) return;
  
  // Check if this is a temporary message (optimistic update)
  if (messageId.startsWith('temp_')) {
    // Update the optimistic message in the local state
    setMessages(prev => prev.map(msg => 
      msg._id === messageId 
        ? { ...msg, content: newContent, edited: true }
        : msg
    ));
    setEditingMessage(null);
    return;
  }

  try {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/messages/${messageId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ content: newContent })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update message');
    }

    socket.emit('edit-message', {
      messageId,
      newContent,
      receiverId: selectedUser._id
    });

    setEditingMessage(null);
    toast.success('Message updated');
  } catch (err) {
    console.error('Error editing message:', err);
    toast.error(err.message || 'Failed to update message');
  }
};

  const handleDeleteMessage = async (messageId) => {
    if (!socket || !selectedUser) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete message');
      }

      socket.emit('delete-message', {
        messageId,
        receiverId: selectedUser._id
      });
      toast.success('Message deleted');
    } catch (err) {
      console.error('Error deleting message:', err);
      toast.error(err.message || 'Failed to delete message');
    }
  };

  const handleTyping = useCallback(() => {
    if (!selectedUser || !socket) return;
    socket.emit('typing', { receiverId: selectedUser._id });
    
    const timeout = setTimeout(() => {
      socket.emit('stop-typing', { receiverId: selectedUser._id });
    }, 2000);

    return () => clearTimeout(timeout);
  }, [selectedUser, socket]);

  // Filter users
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group messages by date
  const groupMessagesByDate = (messages) => {
    const grouped = {};
    messages.forEach(message => {
      const date = format(new Date(message.createdAt), 'MMMM d, yyyy');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(message);
    });
    return grouped;
  };

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`w-72 bg-white border-r border-gray-200 flex flex-col fixed md:static inset-y-0 z-10 transform ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } transition-transform duration-300 ease-in-out shadow-md md:shadow-none`}>
        
        {/* Close button */}
        <button 
          onClick={() => setMobileMenuOpen(false)}
          className="md:hidden absolute top-3 right-3 p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
        >
          <FiX size={20} />
        </button>

        {/* User profile */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-indigo-50">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow">
              {user?.name?.charAt(0)}
            </div>
            <div className="ml-3">
              <h3 className="font-semibold text-gray-900">{user?.name}</h3>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-red-500 transition-colors"
          >
            <FiLogOut size={20} />
          </button>
        </div>
        
        {/* Contacts list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search contacts..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {filteredUsers.map(contact => (
              <li 
                key={contact._id}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedUser?._id === contact._id ? 'bg-indigo-50' : ''
                }`}
                onClick={() => {
                  setSelectedUser(contact);
                  setMobileMenuOpen(false);
                }}
              >
                <div className="flex items-center">
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shadow ${
                      contact.online ? 'bg-green-500' : 'bg-gray-400'
                    }`}>
                      {contact.name.charAt(0)}
                    </div>
                    <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white ${
                      contact.online ? 'bg-green-400' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{contact.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {contact.online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* Main chat area */}
      <div className="flex-1 flex flex-col ml-0 md:ml-72">
        {/* Chat header */}
        {selectedUser ? (
          <div className="bg-white p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center">
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden mr-3 p-2 rounded-full hover:bg-gray-100 text-gray-600"
              >
                <FiMenu size={20} />
              </button>
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow">
                  {selectedUser.name.charAt(0)}
                </div>
                <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white ${
                  selectedUser.online ? 'bg-green-400' : 'bg-gray-300'
                }`} />
              </div>
              <div className="ml-3">
                <p className="font-medium text-gray-900">{selectedUser.name}</p>
                <p className="text-xs text-gray-500">
                  {selectedUser.online ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-4 border-b border-gray-200 flex items-center">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden mr-3 p-2 rounded-full hover:bg-gray-100 text-gray-600"
            >
              <FiMenu size={20} />
            </button>
            <h2 className="font-medium text-gray-900">Select a contact to start chatting</h2>
          </div>
        )}
        
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {selectedUser ? (
            <>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-24 h-24 bg-indigo-100 rounded-full mb-4 flex items-center justify-center text-indigo-500">
                    <FiSend size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-700 mb-1">No messages yet</h3>
                  <p className="text-sm text-gray-500 max-w-md">
                    Start the conversation with {selectedUser.name} by sending your first message
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                    <div key={date} className="text-center">
                      <div className="inline-block px-3 py-1 text-xs text-gray-500 bg-gray-100 rounded-full mb-4">
                        {date}
                      </div>
                      <div className="space-y-2">
                        {dateMessages.map((message) => {
                          const senderId = message.sender._id || message.sender; 
                          const isSender = senderId === user._id;
                          const senderData = isSender 
                            ? user 
                            : users.find(u => u._id === senderId) || { name: "You", avatar: "/images/default-avatar.png" };

                          return (
                            <div key={message._id} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                              {!isSender && (
                                <div className="flex max-w-xs md:max-w-md lg:max-w-lg">
                                  <div className="flex-shrink-0 mr-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                                      senderData.name === "You" ? 'bg-purple-500' : 'bg-gray-300 text-gray-600'
                                    }`}>
                                      {senderData.name.charAt(0)}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-start">
                                    <span className={`text-xs mb-1 ${
                                      senderData.name === "You" ? 'text-purple-600 font-medium' : 'text-gray-500'
                                    }`}>
                                      {senderData.name}
                                    </span>
                                    <div className={`px-4 py-2 rounded-lg rounded-tl-none shadow-sm ${
                                      senderData.name === "You" ? 'bg-purple-100' : 'bg-white'
                                    }`}>
                                      {message.attachment && (
                                        <div className="mb-2">
                                          {message.attachment.type === 'image' && (
                                            <div className="relative w-full h-48 rounded-lg overflow-hidden">
                                              <img
                                                src={message.attachment.url}
                                                alt="Received image"
                                                className="w-full h-full object-cover rounded-lg"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className={`text-sm ${
                                        senderData.name === "You" ? 'text-purple-800' : 'text-gray-800'
                                      }`}>
                                        {message.content}
                                      </div>
                                      <div className={`text-xs mt-1 flex justify-end ${
                                        senderData.name === "You" ? 'text-purple-500' : 'text-gray-500'
                                      }`}>
                                        {format(new Date(message.createdAt), 'h:mm a')}
                                        {message.edited && (
                                          <span className="ml-1 text-xs text-gray-400">(edited)</span>
                                        )}
                                        {message.optimistic && (
                                          <span className={`ml-1 inline-block w-2 h-2 rounded-full animate-pulse ${
                                            senderData.name === "You" ? 'bg-purple-400' : 'bg-gray-400'
                                          }`}></span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {isSender && (
                                <div className="flex max-w-xs md:max-w-md lg:max-w-lg">
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs text-gray-500 mb-1">
                                      You
                                    </span>
                                    <div className="bg-indigo-500 text-white px-4 py-2 rounded-lg rounded-tr-none relative">
                                      {message.attachment && (
                                        <div className="mb-2">
                                          {message.attachment.type === 'image' && (
                                            <div className="relative w-full h-48 rounded-lg overflow-hidden">
                                              <img
                                                src={message.attachment.url}
                                                alt="Sent image"
                                                className="w-full h-full object-cover rounded-lg"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {editingMessage?._id === message._id ? (
                                        <div className="w-full">
                                          <input
                                            type="text"
                                            value={editingMessage.content}
                                            onChange={(e) => setEditingMessage({
                                              ...editingMessage,
                                              content: e.target.value
                                            })}
                                            className="w-full bg-indigo-600 text-white px-2 py-1 rounded border border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleEditMessage(message._id, editingMessage.content);
                                              } else if (e.key === 'Escape') {
                                                setEditingMessage(null);
                                              }
                                            }}
                                          />
                                          <div className="flex items-center space-x-2 mt-2 justify-end">
                                            <button 
                                              onClick={() => handleEditMessage(message._id, editingMessage.content)}
                                              className="text-xs text-indigo-100 hover:text-white flex items-center"
                                            >
                                              <FiEdit className="mr-1" size={12} /> Save
                                            </button>
                                            <button 
                                              onClick={() => setEditingMessage(null)}
                                              className="text-xs text-indigo-100 hover:text-white flex items-center"
                                            >
                                              <FiX className="mr-1" size={12} /> Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="text-sm">{message.content}</div>
                                          <div className="text-xs text-indigo-100 mt-1 flex justify-end items-center">
                                            {format(new Date(message.createdAt), 'h:mm a')}
                                            {message.edited && (
                                              <span className="ml-1 text-xs text-indigo-200">(edited)</span>
                                            )}
                                            {message.optimistic && (
                                              <span className="ml-1 inline-block w-2 h-2 rounded-full bg-indigo-200 animate-pulse"></span>
                                            )}
                                          </div>
                                          <div className="flex items-center space-x-2 mt-1 justify-end">
                                            <button 
                                              onClick={() => setEditingMessage(message)}
                                              className="text-xs text-indigo-100 hover:text-white flex items-center"
                                            >
                                              <FiEdit className="mr-1" size={12} /> Edit
                                            </button>
                                            <button 
                                              onClick={() => {
                                                if (window.confirm('Are you sure you want to delete this message?')) {
                                                  handleDeleteMessage(message._id);
                                                }
                                              }}
                                              className="text-xs text-indigo-100 hover:text-white flex items-center"
                                            >
                                              <FiTrash2 className="mr-1" size={12} /> Delete
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-32 h-32 bg-indigo-100 rounded-full mb-6 flex items-center justify-center text-indigo-500">
                <FiSend size={40} />
              </div>
              <h3 className="text-xl font-medium text-gray-700 mb-2">No chat selected</h3>
              <p className="text-sm text-gray-500 max-w-md mb-6">
                Choose a contact from the sidebar to start messaging or search for someone new
              </p>
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Open Contacts
              </button>
            </div>
          )}
        </div>

        {/* Message input */}
        {selectedUser && (
          <div className="bg-white p-4 border-t border-gray-200 sticky bottom-0">
            {attachmentPreview && (
              <div className="relative mb-2 p-2 bg-gray-100 rounded-lg">
                <div className="relative w-full h-40 rounded-md overflow-hidden">
                  <img
                    src={attachmentPreview}
                    alt="Attachment preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <button 
                  onClick={removeAttachment}
                  className="absolute top-2 right-2 bg-gray-800 bg-opacity-70 text-white p-1 rounded-full hover:bg-opacity-100"
                >
                  <FiX size={16} />
                </button>
              </div>
            )}
            
            {isTyping && (
              <div className="text-xs text-gray-500 mb-2 flex items-center">
                <div className="flex space-x-1 mr-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                {selectedUser.name} is typing...
              </div>
            )}
            
            <div className="flex items-center">
              <div className="flex items-center">
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="p-2 text-gray-500 hover:text-indigo-600 rounded-full hover:bg-gray-100"
                  title="Attach image"
                >
                  <FiPaperclip size={20} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              
              <input
                type="text"
                placeholder={`Message ${selectedUser.name}...`}
                className="flex-1 px-4 py-3 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isSending}
              />
              
              <button
                onClick={handleSendMessage}
                disabled={(!newMessage.trim() && !attachment) || isSending}
                className={`px-4 py-3 rounded-r-lg flex items-center justify-center ${
                  (!newMessage.trim() && !attachment) || isSending 
                    ? 'bg-indigo-300 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700'
                } text-white transition-all shadow-sm`}
              >
                {isSending ? (
                  <span className="animate-spin">↻</span>
                ) : (
                  <FiSend size={18} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;