import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Settings, Bell, Shield, Heart } from 'lucide-react';

const preferencesSchema = z.object({
  minAge: z.number().min(18, 'Minimum age must be at least 18').max(100, 'Invalid age'),
  maxAge: z.number().min(18, 'Maximum age must be at least 18').max(100, 'Invalid age'),
  maxDistance: z.number().min(1, 'Distance must be at least 1 km').max(100, 'Distance cannot exceed 100 km'),
  genderPreference: z.enum(['male', 'female', 'both']),
  notifications: z.boolean(),
  showDistance: z.boolean(),
  showAge: z.boolean(),
});

type PreferencesForm = z.infer<typeof preferencesSchema>;

export function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'preferences' | 'privacy' | 'notifications'>('preferences');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PreferencesForm>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      minAge: 18,
      maxAge: 35,
      maxDistance: 25,
      genderPreference: 'both',
      notifications: true,
      showDistance: true,
      showAge: true,
    },
  });

  const minAge = watch('minAge');
  const maxAge = watch('maxAge');

  const onSubmit = async (data: PreferencesForm) => {
    if (data.minAge >= data.maxAge) {
      toast.error('Maximum age must be greater than minimum age');
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success('Settings updated successfully!');
    } catch {
      toast.error('Failed to update settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'preferences', name: 'Preferences', icon: Heart },
    { id: 'privacy', name: 'Privacy', icon: Shield },
    { id: 'notifications', name: 'Notifications', icon: Bell },
  ] as const;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-gray-600" />
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-pink-500 text-pink-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'preferences' && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Matching Preferences
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Age
                    </label>
                    <input
                      {...register('minAge', { valueAsNumber: true })}
                      type="number"
                      className="input"
                      min="18"
                      max="100"
                    />
                    {errors.minAge && (
                      <p className="mt-1 text-sm text-red-600">{errors.minAge.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Age
                    </label>
                    <input
                      {...register('maxAge', { valueAsNumber: true })}
                      type="number"
                      className="input"
                      min="18"
                      max="100"
                    />
                    {errors.maxAge && (
                      <p className="mt-1 text-sm text-red-600">{errors.maxAge.message}</p>
                    )}
                  </div>
                </div>
                
                {minAge >= maxAge && (
                  <p className="text-sm text-red-600">
                    Maximum age must be greater than minimum age
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Distance (km)
                </label>
                <input
                  {...register('maxDistance', { valueAsNumber: true })}
                  type="number"
                  className="input"
                  min="1"
                  max="100"
                />
                {errors.maxDistance && (
                  <p className="mt-1 text-sm text-red-600">{errors.maxDistance.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gender Preference
                </label>
                <select {...register('genderPreference')} className="input">
                  <option value="both">Everyone</option>
                  <option value="male">Men</option>
                  <option value="female">Women</option>
                </select>
                {errors.genderPreference && (
                  <p className="mt-1 text-sm text-red-600">{errors.genderPreference.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Saving...' : 'Save Preferences'}
              </button>
            </form>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Privacy Settings
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Show Distance</h4>
                    <p className="text-sm text-gray-600">
                      Allow others to see your distance from them
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      {...register('showDistance')}
                      type="checkbox"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Show Age</h4>
                    <p className="text-sm text-gray-600">
                      Display your age on your profile
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      {...register('showAge')}
                      type="checkbox"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Notification Settings
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Push Notifications</h4>
                    <p className="text-sm text-gray-600">
                      Receive notifications for new matches and messages
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      {...register('notifications')}
                      type="checkbox"
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}