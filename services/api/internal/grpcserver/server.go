package grpcserver

import (
	"database/sql"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/services/api/internal/notification"
	sentrypkg "github.com/irfndi/match-bot/services/api/internal/sentry"
	"github.com/irfndi/match-bot/services/api/internal/services"
	"google.golang.org/grpc"
)

// Options holds optional dependencies for the gRPC server.
type Options struct {
	NotificationService *notification.Service
}

// New creates a new gRPC server with all services registered.
func New(db *sql.DB, opts *Options) *grpc.Server {
	server := grpc.NewServer(
		grpc.UnaryInterceptor(sentrypkg.UnaryServerInterceptor()),
	)
	pb.RegisterHealthServiceServer(server, &HealthService{})
	pb.RegisterUserServiceServer(server, services.NewUserService(db))
	pb.RegisterMatchServiceServer(server, services.NewMatchService(db))

	// Register notification service if provided
	if opts != nil && opts.NotificationService != nil {
		pb.RegisterNotificationServiceServer(server, notification.NewGRPCServiceWithDB(opts.NotificationService, db))
	}

	return server
}
