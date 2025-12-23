package grpcserver

import (
	"database/sql"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	sentrypkg "github.com/irfndi/match-bot/services/api/internal/sentry"
	"github.com/irfndi/match-bot/services/api/internal/services"
	"google.golang.org/grpc"
)

func New(db *sql.DB) *grpc.Server {
	server := grpc.NewServer(
		grpc.UnaryInterceptor(sentrypkg.UnaryServerInterceptor()),
	)
	pb.RegisterHealthServiceServer(server, &HealthService{})
	pb.RegisterUserServiceServer(server, services.NewUserService(db))
	pb.RegisterMatchServiceServer(server, services.NewMatchService(db))
	return server
}
