# Feature Flags Management for MeetsMatch

## Table of Contents
- [Overview](#overview)
- [Feature Flag Architecture](#feature-flag-architecture)
- [Available Feature Flags](#available-feature-flags)
- [Managing Feature Flags](#managing-feature-flags)
- [Implementation Details](#implementation-details)
- [Environment-Specific Flags](#environment-specific-flags)
- [Best Practices](#best-practices)
- [Monitoring and Analytics](#monitoring-and-analytics)
- [Troubleshooting](#troubleshooting)

## Overview

MeetsMatch uses a Redis-based feature flag system to enable dynamic configuration changes without requiring application deployments. This allows for safe rollouts of new features, A/B testing, and quick rollbacks if issues arise.

### Benefits
- **Zero-downtime feature toggles**: Enable/disable features instantly
- **Gradual rollouts**: Control feature exposure to specific user segments
- **A/B testing**: Test different feature variants
- **Emergency rollbacks**: Quickly disable problematic features
- **Environment isolation**: Different flag states per environment
- **Performance optimization**: Redis-based caching for fast flag evaluation

## Feature Flag Architecture

### Storage Layer
Feature flags are stored in Redis with the following structure:

```
feature:{flag_name} -> {flag_value}
feature:{flag_name}:config -> {flag_configuration}
feature:{flag_name}:users -> {user_specific_overrides}
```

### Service Integration
Feature flags are integrated across all services:

- **Go Bot Service**: Direct Redis integration for real-time flag evaluation
- **TypeScript API**: Redis client with caching for API endpoints
- **React Frontend**: API-based flag fetching with local caching

### Flag Types
1. **Boolean Flags**: Simple on/off toggles
2. **String Flags**: Configuration values (e.g., algorithm versions)
3. **Number Flags**: Numeric configurations (e.g., rate limits)
4. **JSON Flags**: Complex configuration objects
5. **Percentage Flags**: Gradual rollout controls (0-100%)

## Available Feature Flags

### Core Features

#### `enable_new_matching_algorithm`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables the new ML-based matching algorithm
- **Impact**: Changes how user matches are calculated and ranked
- **Rollback**: Safe - falls back to original algorithm

#### `enable_real_time_chat`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables WebSocket-based real-time messaging
- **Impact**: Replaces polling-based chat with real-time updates
- **Rollback**: Safe - falls back to polling mechanism

#### `enable_media_compression`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enables automatic media file compression
- **Impact**: Reduces storage costs and improves upload/download speeds
- **Rollback**: Safe - disables compression for new uploads

#### `enable_location_matching`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Includes location data in matching algorithm
- **Impact**: Prioritizes geographically closer matches
- **Rollback**: Safe - removes location weighting

### User Interface Features

#### `enable_dark_mode`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enables dark mode theme option
- **Impact**: Adds dark theme toggle to user interface
- **Rollback**: Safe - removes theme option

#### `enable_profile_verification`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables profile verification system
- **Impact**: Adds verification badges and process
- **Rollback**: Safe - hides verification features

#### `enable_advanced_filters`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables advanced search and filter options
- **Impact**: Adds more granular matching preferences
- **Rollback**: Safe - falls back to basic filters

### Administrative Features

#### `enable_admin_panel`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enables administrative web interface
- **Impact**: Provides admin access to user management and analytics
- **Rollback**: Safe - disables admin access

#### `enable_user_analytics`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enables user behavior tracking and analytics
- **Impact**: Collects usage data for insights and improvements
- **Rollback**: Safe - stops data collection

#### `enable_automated_moderation`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables AI-powered content moderation
- **Impact**: Automatically flags inappropriate content
- **Rollback**: Safe - falls back to manual moderation

### Performance and Scaling

#### `matching_batch_size`
- **Type**: Number
- **Default**: `50`
- **Description**: Number of potential matches to process per batch
- **Impact**: Affects matching performance and resource usage
- **Rollback**: Safe - adjusts batch processing

#### `cache_ttl_seconds`
- **Type**: Number
- **Default**: `3600`
- **Description**: Cache time-to-live in seconds
- **Impact**: Controls how long data is cached
- **Rollback**: Safe - adjusts cache behavior

#### `rate_limit_requests_per_minute`
- **Type**: Number
- **Default**: `60`
- **Description**: API rate limit per user per minute
- **Impact**: Controls API usage throttling
- **Rollback**: Safe - adjusts rate limiting

### Experimental Features

#### `enable_video_profiles`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables video profile uploads and playback
- **Impact**: Adds video support to user profiles
- **Rollback**: Safe - hides video features

#### `enable_voice_messages`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables voice message recording and playback
- **Impact**: Adds voice messaging to chat system
- **Rollback**: Safe - disables voice features

#### `enable_ai_conversation_starter`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables AI-generated conversation starters
- **Impact**: Suggests conversation topics based on profiles
- **Rollback**: Safe - removes AI suggestions

## Managing Feature Flags

### Using Redis CLI

#### Setting Feature Flags
```bash
# Enable a boolean feature
redis-cli SET feature:enable_new_matching_algorithm true

# Set a numeric value
redis-cli SET feature:matching_batch_size 100

# Set a string value
redis-cli SET feature:matching_algorithm_version "v2.1"

# Set with expiration (auto-disable after 1 hour)
redis-cli SETEX feature:enable_experimental_feature 3600 true
```

#### Getting Feature Flags
```bash
# Get a specific flag
redis-cli GET feature:enable_new_matching_algorithm

# Get all feature flags
redis-cli KEYS "feature:*"

# Get flag with TTL info
redis-cli TTL feature:enable_experimental_feature
```

#### Deleting Feature Flags
```bash
# Remove a feature flag (falls back to default)
redis-cli DEL feature:enable_new_matching_algorithm

# Remove multiple flags
redis-cli DEL feature:enable_feature1 feature:enable_feature2
```

### Using the Admin API

#### REST Endpoints
```bash
# Get all feature flags
GET /api/admin/feature-flags

# Get specific feature flag
GET /api/admin/feature-flags/enable_new_matching_algorithm

# Set feature flag
PUT /api/admin/feature-flags/enable_new_matching_algorithm
Content-Type: application/json
{
  "value": true,
  "description": "Enable new ML matching algorithm",
  "ttl": 3600
}

# Delete feature flag
DELETE /api/admin/feature-flags/enable_new_matching_algorithm
```

#### Bulk Operations
```bash
# Set multiple flags
PUT /api/admin/feature-flags/bulk
Content-Type: application/json
{
  "flags": {
    "enable_new_matching_algorithm": true,
    "enable_real_time_chat": false,
    "matching_batch_size": 75
  }
}
```

### Using the Web Admin Panel

1. **Access Admin Panel**: Navigate to `/admin/feature-flags`
2. **View Flags**: See all current flags with their values and descriptions
3. **Toggle Flags**: Use switches to enable/disable boolean flags
4. **Edit Values**: Click on numeric/string flags to edit values
5. **Add New Flags**: Use the "Add Flag" button to create new flags
6. **Flag History**: View change history and rollback if needed

## Implementation Details

### Go Service Implementation

```go
// internal/services/feature_flags.go
type FeatureFlagService struct {
    redis  *redis.Client
    cache  map[string]interface{}
    mutex  sync.RWMutex
}

func (s *FeatureFlagService) GetBoolFlag(flagName string, defaultValue bool) bool {
    value, err := s.redis.Get(context.Background(), "feature:"+flagName).Result()
    if err != nil {
        return defaultValue
    }
    
    boolValue, err := strconv.ParseBool(value)
    if err != nil {
        return defaultValue
    }
    
    return boolValue
}

func (s *FeatureFlagService) GetIntFlag(flagName string, defaultValue int) int {
    value, err := s.redis.Get(context.Background(), "feature:"+flagName).Result()
    if err != nil {
        return defaultValue
    }
    
    intValue, err := strconv.Atoi(value)
    if err != nil {
        return defaultValue
    }
    
    return intValue
}
```

### TypeScript API Implementation

```typescript
// src/services/FeatureFlagService.ts
export class FeatureFlagService {
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();

  async getBoolFlag(flagName: string, defaultValue: boolean): Promise<boolean> {
    const cachedValue = this.getCachedValue(flagName);
    if (cachedValue !== null) {
      return cachedValue;
    }

    try {
      const value = await this.redis.get(`feature:${flagName}`);
      if (value === null) {
        return defaultValue;
      }

      const boolValue = value.toLowerCase() === 'true';
      this.setCachedValue(flagName, boolValue);
      return boolValue;
    } catch (error) {
      console.error(`Error getting feature flag ${flagName}:`, error);
      return defaultValue;
    }
  }

  async setFlag(flagName: string, value: any, ttl?: number): Promise<void> {
    const key = `feature:${flagName}`;
    
    if (ttl) {
      await this.redis.setex(key, ttl, String(value));
    } else {
      await this.redis.set(key, String(value));
    }
    
    this.setCachedValue(flagName, value);
  }
}
```

### React Frontend Implementation

```typescript
// src/hooks/useFeatureFlags.ts
export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const response = await api.get('/feature-flags');
        setFlags(response.data);
      } catch (error) {
        console.error('Error fetching feature flags:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFlags();
  }, []);

  const isEnabled = (flagName: string, defaultValue: boolean = false): boolean => {
    return flags[flagName] ?? defaultValue;
  };

  const getValue = (flagName: string, defaultValue: any = null): any => {
    return flags[flagName] ?? defaultValue;
  };

  return { flags, loading, isEnabled, getValue };
};
```

## Environment-Specific Flags

### Development Environment
```bash
# Enable all experimental features for testing
redis-cli SET feature:enable_video_profiles true
redis-cli SET feature:enable_voice_messages true
redis-cli SET feature:enable_ai_conversation_starter true

# Relaxed rate limits for development
redis-cli SET feature:rate_limit_requests_per_minute 1000

# Debug features
redis-cli SET feature:enable_debug_mode true
redis-cli SET feature:enable_performance_metrics true
```

### Staging Environment
```bash
# Test new features before production
redis-cli SET feature:enable_new_matching_algorithm true
redis-cli SET feature:enable_profile_verification true

# Production-like settings
redis-cli SET feature:rate_limit_requests_per_minute 100
redis-cli SET feature:matching_batch_size 50
```

### Production Environment
```bash
# Conservative feature enablement
redis-cli SET feature:enable_media_compression true
redis-cli SET feature:enable_location_matching true
redis-cli SET feature:enable_admin_panel true

# Performance optimizations
redis-cli SET feature:cache_ttl_seconds 3600
redis-cli SET feature:matching_batch_size 50
```

## Best Practices

### Flag Naming Conventions
- Use descriptive, lowercase names with underscores
- Prefix with action: `enable_`, `disable_`, `max_`, `min_`
- Group related flags: `matching_*`, `chat_*`, `admin_*`

### Flag Lifecycle Management
1. **Creation**: Start with conservative defaults
2. **Testing**: Enable in development/staging first
3. **Gradual Rollout**: Use percentage flags for gradual deployment
4. **Monitoring**: Track metrics and user feedback
5. **Cleanup**: Remove flags after features are stable

### Safety Guidelines
- Always provide sensible default values
- Test flag changes in non-production environments first
- Monitor application metrics after flag changes
- Have rollback procedures ready
- Document flag purposes and impacts

### Performance Considerations
- Cache frequently accessed flags
- Use appropriate TTL values for caching
- Batch flag evaluations when possible
- Monitor Redis performance and memory usage

## Monitoring and Analytics

### Flag Usage Metrics
```bash
# Track flag evaluation counts
redis-cli INCR "metrics:flag_evaluations:enable_new_matching_algorithm"

# Track flag changes
redis-cli LPUSH "audit:flag_changes" "{\"flag\":\"enable_new_matching_algorithm\",\"value\":true,\"timestamp\":\"2024-01-15T10:30:00Z\",\"user\":\"admin@example.com\"}"
```

### Monitoring Dashboard
The admin panel provides:
- Real-time flag status
- Flag change history
- Usage statistics
- Performance impact metrics
- User segment analysis

### Alerting
Set up alerts for:
- Unexpected flag changes
- High flag evaluation latency
- Redis connection issues
- Flag-related application errors

## Troubleshooting

### Common Issues

#### Flag Not Taking Effect
```bash
# Check if flag exists
redis-cli GET feature:your_flag_name

# Check Redis connection
redis-cli ping

# Clear application cache
redis-cli DEL "cache:feature_flags"

# Restart application services
docker-compose restart bot api
```

#### Redis Connection Issues
```bash
# Check Redis service status
docker-compose ps redis

# View Redis logs
docker-compose logs redis

# Test Redis connectivity
redis-cli -h localhost -p 6379 ping
```

#### Performance Issues
```bash
# Monitor Redis memory usage
redis-cli info memory

# Check slow queries
redis-cli slowlog get 10

# Monitor flag evaluation performance
redis-cli monitor | grep "feature:"
```

### Debugging Commands

```bash
# List all feature flags
redis-cli KEYS "feature:*" | sort

# Get flag with metadata
redis-cli HGETALL "feature:enable_new_matching_algorithm:config"

# Check flag expiration
redis-cli TTL "feature:enable_experimental_feature"

# View flag change history
redis-cli LRANGE "audit:flag_changes" 0 -1

# Monitor real-time flag access
redis-cli monitor | grep "GET.*feature:"
```

### Emergency Procedures

#### Disable All Experimental Features
```bash
#!/bin/bash
# emergency_disable.sh
redis-cli DEL feature:enable_video_profiles
redis-cli DEL feature:enable_voice_messages
redis-cli DEL feature:enable_ai_conversation_starter
redis-cli DEL feature:enable_automated_moderation
echo "Emergency disable completed"
```

#### Rollback to Safe Configuration
```bash
#!/bin/bash
# safe_config.sh
redis-cli SET feature:enable_media_compression true
redis-cli SET feature:enable_location_matching true
redis-cli SET feature:matching_batch_size 50
redis-cli SET feature:rate_limit_requests_per_minute 60
echo "Safe configuration applied"
```

This feature flag management guide provides comprehensive information for controlling and monitoring feature rollouts in the MeetsMatch application. For additional implementation details, refer to the service-specific code and configuration files.
