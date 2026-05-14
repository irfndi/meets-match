package httpserver

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	pb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1/meetsmatchv1connect"
	"github.com/irfndi/match-bot/services/api/internal/services"
)

type userServiceConnectAdapter struct {
	svc *services.UserService
}

func (a *userServiceConnectAdapter) GetUser(ctx context.Context, req *connect.Request[pb.GetUserRequest]) (*connect.Response[pb.GetUserResponse], error) {
	resp, err := a.svc.GetUser(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *userServiceConnectAdapter) CreateUser(ctx context.Context, req *connect.Request[pb.CreateUserRequest]) (*connect.Response[pb.CreateUserResponse], error) {
	resp, err := a.svc.CreateUser(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *userServiceConnectAdapter) UpdateUser(ctx context.Context, req *connect.Request[pb.UpdateUserRequest]) (*connect.Response[pb.UpdateUserResponse], error) {
	resp, err := a.svc.UpdateUser(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *userServiceConnectAdapter) UpdateLastActive(ctx context.Context, req *connect.Request[pb.UpdateLastActiveRequest]) (*connect.Response[pb.UpdateLastActiveResponse], error) {
	resp, err := a.svc.UpdateLastActive(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *userServiceConnectAdapter) UpdateLastRemindedAt(ctx context.Context, req *connect.Request[pb.UpdateLastRemindedAtRequest]) (*connect.Response[pb.UpdateLastRemindedAtResponse], error) {
	resp, err := a.svc.UpdateLastRemindedAt(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

var _ meetsmatchv1connect.UserServiceHandler = (*userServiceConnectAdapter)(nil)

type matchServiceConnectAdapter struct {
	svc *services.MatchService
}

func (a *matchServiceConnectAdapter) GetPotentialMatches(ctx context.Context, req *connect.Request[pb.GetPotentialMatchesRequest]) (*connect.Response[pb.GetPotentialMatchesResponse], error) {
	resp, err := a.svc.GetPotentialMatches(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) LikeMatch(ctx context.Context, req *connect.Request[pb.LikeMatchRequest]) (*connect.Response[pb.LikeMatchResponse], error) {
	resp, err := a.svc.LikeMatch(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) DislikeMatch(ctx context.Context, req *connect.Request[pb.DislikeMatchRequest]) (*connect.Response[pb.DislikeMatchResponse], error) {
	resp, err := a.svc.DislikeMatch(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) SkipMatch(ctx context.Context, req *connect.Request[pb.SkipMatchRequest]) (*connect.Response[pb.SkipMatchResponse], error) {
	resp, err := a.svc.SkipMatch(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) GetMatchList(ctx context.Context, req *connect.Request[pb.GetMatchListRequest]) (*connect.Response[pb.GetMatchListResponse], error) {
	resp, err := a.svc.GetMatchList(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) GetMatch(ctx context.Context, req *connect.Request[pb.GetMatchRequest]) (*connect.Response[pb.GetMatchResponse], error) {
	resp, err := a.svc.GetMatch(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

func (a *matchServiceConnectAdapter) CreateMatch(ctx context.Context, req *connect.Request[pb.CreateMatchRequest]) (*connect.Response[pb.CreateMatchResponse], error) {
	resp, err := a.svc.CreateMatch(ctx, req.Msg)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(resp), nil
}

var _ meetsmatchv1connect.MatchServiceHandler = (*matchServiceConnectAdapter)(nil)

type healthServiceConnectAdapter struct{}

func (a *healthServiceConnectAdapter) Check(ctx context.Context, req *connect.Request[pb.HealthCheckRequest]) (*connect.Response[pb.HealthCheckResponse], error) {
	return connect.NewResponse(&pb.HealthCheckResponse{Status: "ok"}), nil
}

var _ meetsmatchv1connect.HealthServiceHandler = (*healthServiceConnectAdapter)(nil)

func registerConnectHandlers(mux *http.ServeMux, userSvc *services.UserService, matchSvc *services.MatchService) {
	userPath, userHandler := meetsmatchv1connect.NewUserServiceHandler(&userServiceConnectAdapter{svc: userSvc})
	mux.Handle(userPath, userHandler)

	matchPath, matchHandler := meetsmatchv1connect.NewMatchServiceHandler(&matchServiceConnectAdapter{svc: matchSvc})
	mux.Handle(matchPath, matchHandler)

	// Health check via ConnectRPC (optional, /health REST endpoint already exists)
	healthPath, healthHandler := meetsmatchv1connect.NewHealthServiceHandler(&healthServiceConnectAdapter{})
	mux.Handle(healthPath, healthHandler)
}
