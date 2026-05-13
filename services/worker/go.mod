module github.com/irfndi/match-bot/services/worker

go 1.25.9

require (
	github.com/hibiken/asynq v0.26.0
	github.com/irfndi/match-bot/packages/contracts v0.0.0
	golang.org/x/sync v0.20.0
	google.golang.org/grpc v1.81.0
)

require (
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/redis/go-redis/v9 v9.19.0 // indirect
	github.com/robfig/cron/v3 v3.0.1 // indirect
	github.com/spf13/cast v1.10.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/net v0.54.0 // indirect
	golang.org/x/sys v0.44.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	golang.org/x/time v0.15.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260511170946-3700d4141b60 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

replace github.com/irfndi/match-bot/packages/contracts => ../../packages/contracts
