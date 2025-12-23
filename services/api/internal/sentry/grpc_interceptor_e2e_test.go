package sentry

import (
	"context"
	"net"
	"testing"
	"time"

	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

type panicHealthService struct {
	pb.UnimplementedHealthServiceServer
}

func (panicHealthService) Check(context.Context, *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	panic("boom")
}

func TestUnaryServerInterceptor_E2E_PanicRecovery(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to listen: %v", err)
	}
	defer listener.Close()

	server := grpc.NewServer(grpc.UnaryInterceptor(UnaryServerInterceptor()))
	pb.RegisterHealthServiceServer(server, panicHealthService{})

	go func() {
		_ = server.Serve(listener)
	}()
	defer server.Stop()

	conn, err := grpc.NewClient(
		listener.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("Failed to dial: %v", err)
	}
	defer conn.Close()

	client := pb.NewHealthServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err = client.Check(ctx, &pb.HealthCheckRequest{})
	if err == nil {
		t.Fatal("Expected error from panic recovery")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("Expected gRPC status error, got %v", err)
	}
	if st.Code() != codes.Internal {
		t.Fatalf("Expected Internal code, got %v", st.Code())
	}
}
