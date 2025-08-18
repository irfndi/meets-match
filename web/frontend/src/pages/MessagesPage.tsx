import { useState } from 'react';
import { MessageCircle, Send, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
}

// Mock data for demonstration
const mockConversations: Conversation[] = [
  {
    id: '1',
    userId: '1',
    userName: 'Sarah Johnson',
    userPhoto: 'https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20woman%20portrait%20professional%20headshot%20smiling&image_size=square',
    lastMessage: 'Hey! How was your weekend?',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    unreadCount: 2,
  },
  {
    id: '2',
    userId: '2',
    userName: 'Emily Chen',
    userPhoto: 'https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=asian%20woman%20portrait%20artistic%20creative%20smiling&image_size=square',
    lastMessage: 'That restaurant looks amazing!',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    unreadCount: 0,
  },
  {
    id: '3',
    userId: '3',
    userName: 'Jessica Martinez',
    userPhoto: 'https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=latina%20woman%20portrait%20yoga%20instructor%20peaceful&image_size=square',
    lastMessage: 'Would love to go hiking sometime!',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    unreadCount: 1,
  },
];

const mockMessages: Message[] = [
  {
    id: '1',
    senderId: '1',
    content: 'Hi there! Thanks for the match!',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: '2',
    senderId: 'current',
    content: 'Hey! Nice to meet you too!',
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: '3',
    senderId: '1',
    content: 'How was your weekend?',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
  },
];

export function MessagesPage() {
  const [conversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const message: Message = {
        id: Date.now().toString(),
        senderId: 'current',
        content: newMessage.trim(),
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, message]);
      setNewMessage('');
    } catch {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  if (selectedConversation) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card overflow-hidden">
          {/* Chat Header */}
          <div className="bg-white border-b border-gray-200 p-4 flex items-center space-x-4">
            <button
              onClick={() => setSelectedConversation(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden">
                {selectedConversation.userPhoto ? (
                  <img
                    src={selectedConversation.userPhoto}
                    alt={selectedConversation.userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-300"></div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedConversation.userName}
                </h3>
                <p className="text-sm text-green-600">Online</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="h-96 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.senderId === 'current' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    message.senderId === 'current'
                      ? 'bg-pink-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p>{message.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      message.senderId === 'current'
                        ? 'text-pink-100'
                        : 'text-gray-500'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-200 p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="input flex-1"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !newMessage.trim()}
                className="btn-primary px-4"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>

        {conversations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Messages Yet
            </h2>
            <p className="text-gray-600">
              Start matching with people to begin conversations!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gray-200 rounded-full overflow-hidden">
                      {conversation.userPhoto ? (
                        <img
                          src={conversation.userPhoto}
                          alt={conversation.userName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300"></div>
                      )}
                    </div>
                    {conversation.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-pink-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {conversation.unreadCount}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {conversation.userName}
                      </h3>
                      {conversation.lastMessageTime && (
                        <span className="text-sm text-gray-500">
                          {formatTime(conversation.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    {conversation.lastMessage && (
                      <p className="text-gray-600 truncate mt-1">
                        {conversation.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}