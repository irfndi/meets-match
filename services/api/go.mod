module github.com/irfndi/match-bot/services/api

go 1.25.9

require (
	github.com/getsentry/sentry-go v0.46.2
	github.com/gofiber/fiber/v2 v2.52.13
	github.com/google/uuid v1.6.0
	github.com/irfndi/match-bot/packages/contracts v0.0.0
	github.com/lib/pq v1.12.3
	github.com/redis/go-redis/v9 v9.19.0
	golang.org/x/sync v0.20.0
	google.golang.org/grpc v1.81.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/andybalholm/brotli v1.2.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/clipperhouse/uax29/v2 v2.7.0 // indirect
	github.com/klauspost/compress v1.18.6 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/mattn/go-runewidth v0.0.23 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasthttp v1.71.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/net v0.54.0 // indirect
	golang.org/x/sys v0.44.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260511170946-3700d4141b60 // indirect
)

replace github.com/irfndi/match-bot/packages/contracts => ../../packages/contracts
