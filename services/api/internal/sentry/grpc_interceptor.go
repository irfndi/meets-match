package sentry

import (
	"context"

	"github.com/getsentry/sentry-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UnaryServerInterceptor returns a gRPC unary server interceptor that captures errors.
func UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (resp interface{}, err error) {
		// Clone hub and attach to context first
		hub := sentry.CurrentHub().Clone()
		ctx = sentry.SetHubOnContext(ctx, hub)

		hub.Scope().SetTag("grpc.method", info.FullMethod)

		// Add breadcrumb to the cloned hub's scope (not global)
		hub.AddBreadcrumb(&sentry.Breadcrumb{
			Category: "grpc",
			Message:  info.FullMethod,
			Level:    sentry.LevelInfo,
			Data: map[string]interface{}{
				"method": info.FullMethod,
			},
		}, nil)

		defer func() {
			if recovered := recover(); recovered != nil {
				hub.RecoverWithContext(ctx, recovered)
				resp = nil
				err = status.Error(codes.Internal, "internal server error")
			}
		}()

		resp, err = handler(ctx, req)
		if err != nil {
			// Only capture Internal errors and above (not NotFound, InvalidArgument, etc.)
			if shouldCaptureGRPCError(err) {
				hub.CaptureException(err)
			}
		}

		return resp, err
	}
}

// shouldCaptureGRPCError determines if a gRPC error should be reported to Sentry.
// We only capture unexpected errors (Internal, Unknown, DataLoss, Unavailable).
// Expected errors like NotFound, InvalidArgument, PermissionDenied are not captured.
func shouldCaptureGRPCError(err error) bool {
	if err == nil {
		return false
	}

	st, ok := status.FromError(err)
	if !ok {
		// Non-gRPC error, capture it
		return true
	}

	switch st.Code() {
	case codes.Internal, codes.Unknown, codes.DataLoss, codes.Unavailable:
		return true
	default:
		return false
	}
}
