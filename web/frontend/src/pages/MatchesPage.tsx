import { useState } from 'react';
import { Heart, X, MapPin, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Match {
  id: string;
  name: string;
  age: number;
  bio?: string;
  photos: string[];
  location?: string;
  distance?: number;
}

// Mock data for demonstration
const mockMatches: Match[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    age: 26,
    bio: 'Love hiking, coffee, and good conversations. Looking for someone genuine.',
    photos: ['https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20woman%20portrait%20professional%20headshot%20smiling&image_size=square'],
    location: 'New York, NY',
    distance: 2.5,
  },
  {
    id: '2',
    name: 'Emily Chen',
    age: 24,
    bio: 'Artist and dog lover. Always up for trying new restaurants!',
    photos: ['https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=asian%20woman%20portrait%20artistic%20creative%20smiling&image_size=square'],
    location: 'Brooklyn, NY',
    distance: 5.2,
  },
  {
    id: '3',
    name: 'Jessica Martinez',
    age: 28,
    bio: 'Yoga instructor and travel enthusiast. Let\'s explore the world together!',
    photos: ['https://trae-api-sg.mchost.guru/api/ide/v1/text_to_image?prompt=latina%20woman%20portrait%20yoga%20instructor%20peaceful&image_size=square'],
    location: 'Manhattan, NY',
    distance: 3.8,
  },
];

export function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>(mockMatches);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const currentMatch = matches[currentIndex];

  const handleLike = async () => {
    if (!currentMatch) return;
    
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.success(`You liked ${currentMatch.name}!`);
      nextMatch();
    } catch {
      toast.error('Failed to like. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePass = async () => {
    if (!currentMatch) return;
    
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 300));
      
      nextMatch();
    } catch {
      toast.error('Failed to pass. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const nextMatch = () => {
    if (currentIndex < matches.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // No more matches
      setMatches([]);
    }
  };

  if (matches.length === 0) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card p-8 text-center">
          <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No More Matches
          </h2>
          <p className="text-gray-600 mb-6">
            You've seen all available matches. Check back later for new people!
          </p>
          <button
            onClick={() => {
              setMatches(mockMatches);
              setCurrentIndex(0);
            }}
            className="btn-primary"
          >
            Refresh Matches
          </button>
        </div>
      </div>
    );
  }

  if (!currentMatch) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="card overflow-hidden">
        {/* Photo */}
        <div className="relative h-96 bg-gray-200">
          <img
            src={currentMatch.photos[0]}
            alt={currentMatch.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
            {currentIndex + 1} / {matches.length}
          </div>
        </div>

        {/* Info */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentMatch.name}
              </h2>
              <p className="text-gray-600">{currentMatch.age} years old</p>
            </div>
            {currentMatch.distance && (
              <div className="flex items-center space-x-1 text-gray-500">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">{currentMatch.distance} km away</span>
              </div>
            )}
          </div>

          {currentMatch.location && (
            <div className="flex items-center space-x-2 text-gray-600 mb-4">
              <MapPin className="h-4 w-4" />
              <span>{currentMatch.location}</span>
            </div>
          )}

          {currentMatch.bio && (
            <div className="mb-6">
              <p className="text-gray-700">{currentMatch.bio}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={handlePass}
              disabled={isLoading}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <X className="h-5 w-5" />
              <span>Pass</span>
            </button>
            <button
              onClick={handleLike}
              disabled={isLoading}
              className="flex-1 bg-pink-600 hover:bg-pink-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <Heart className="h-5 w-5" />
              <span>Like</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-500 mb-2">
          Swipe or use buttons to make your choice
        </p>
        <button className="text-pink-600 hover:text-pink-700 text-sm font-medium flex items-center justify-center space-x-1 mx-auto">
          <MessageCircle className="h-4 w-4" />
          <span>View Mutual Matches</span>
        </button>
      </div>
    </div>
  );
}