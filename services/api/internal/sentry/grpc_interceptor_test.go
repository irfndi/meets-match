package sentry

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestUnaryServerInterceptor_Success(t *testing.T) {
	interceptor := UnaryServerInterceptor()

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return "success", nil
	}

	info := &grpc.UnaryServerInfo{FullMethod: "/test/Method"}

	resp, err := interceptor(context.Background(), nil, info, handler)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if resp != "success" {
		t.Errorf("Expected success response")
	}
}

func TestUnaryServerInterceptor_NotFoundError(t *testing.T) {
	interceptor := UnaryServerInterceptor()

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return nil, status.Error(codes.NotFound, "not found")
	}

	info := &grpc.UnaryServerInfo{FullMethod: "/test/Method"}

	_, err := interceptor(context.Background(), nil, info, handler)
	if err == nil {
		t.Errorf("Expected error")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Errorf("Expected gRPC status error")
	}
	if st.Code() != codes.NotFound {
		t.Errorf("Expected NotFound code, got %v", st.Code())
	}
}

func TestUnaryServerInterceptor_InternalError(t *testing.T) {
	interceptor := UnaryServerInterceptor()

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return nil, status.Error(codes.Internal, "internal error")
	}

	info := &grpc.UnaryServerInfo{FullMethod: "/test/Method"}

	_, err := interceptor(context.Background(), nil, info, handler)
	if err == nil {
		t.Errorf("Expected error")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Errorf("Expected gRPC status error")
	}
	if st.Code() != codes.Internal {
		t.Errorf("Expected Internal code, got %v", st.Code())
	}
}

func TestUnaryServerInterceptor_Panic(t *testing.T) {
	interceptor := UnaryServerInterceptor()

	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		panic("boom")
	}

	info := &grpc.UnaryServerInfo{FullMethod: "/test/Method"}

	resp, err := interceptor(context.Background(), nil, info, handler)
	if err == nil {
		t.Fatal("Expected error from panic recovery")
	}
	if resp != nil {
		t.Errorf("Expected nil response, got %v", resp)
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Errorf("Expected gRPC status error")
	}
	if st.Code() != codes.Internal {
		t.Errorf("Expected Internal code, got %v", st.Code())
	}
}

func TestShouldCaptureGRPCError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "NotFound should not be captured",
			err:      status.Error(codes.NotFound, "not found"),
			expected: false,
		},
		{
			name:     "InvalidArgument should not be captured",
			err:      status.Error(codes.InvalidArgument, "invalid"),
			expected: false,
		},
		{
			name:     "PermissionDenied should not be captured",
			err:      status.Error(codes.PermissionDenied, "denied"),
			expected: false,
		},
		{
			name:     "Internal should be captured",
			err:      status.Error(codes.Internal, "internal"),
			expected: true,
		},
		{
			name:     "Unknown should be captured",
			err:      status.Error(codes.Unknown, "unknown"),
			expected: true,
		},
		{
			name:     "DataLoss should be captured",
			err:      status.Error(codes.DataLoss, "data loss"),
			expected: true,
		},
		{
			name:     "Unavailable should be captured",
			err:      status.Error(codes.Unavailable, "unavailable"),
			expected: true,
		},
		{
			name:     "non-gRPC error should be captured",
			err:      context.DeadlineExceeded,
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := shouldCaptureGRPCError(tt.err)
			if result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}
