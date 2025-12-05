from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from src.bot.application import BotApplication
from src.config import settings
from src.utils.database import init_database
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Initialize OpenTelemetry if enabled
if settings.ENABLE_TELEMETRY and settings.OTEL_EXPORTER_OTLP_ENDPOINT:
    try:
        logger.info("Initializing OpenTelemetry...")
        resource = Resource(
            attributes={
                SERVICE_NAME: settings.OTEL_SERVICE_NAME,
                "environment": settings.ENVIRONMENT,
            }
        )

        headers = {}
        if settings.OTEL_EXPORTER_OTLP_HEADERS:
            try:
                for header in settings.OTEL_EXPORTER_OTLP_HEADERS.split(","):
                    if "=" in header:
                        key, value = header.split("=", 1)
                        headers[key.strip().lower()] = value.strip()
            except Exception as e:
                logger.warning(f"Failed to parse OTEL headers: {e}")

        trace_provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT,
                insecure=settings.OTEL_EXPORTER_OTLP_INSECURE,
                headers=headers,
            )
        )
        trace_provider.add_span_processor(processor)
        trace.set_tracer_provider(trace_provider)

        # Instrument libraries
        SQLAlchemyInstrumentor().instrument()
        RedisInstrumentor().instrument()

        logger.info("OpenTelemetry initialized")
    except Exception as e:
        logger.error(f"Failed to initialize OpenTelemetry: {e}")

# Global bot instance
bot_app = BotApplication()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan."""
    # Startup
    logger.info("Starting API and Bot...")

    # Initialize database
    init_database()

    # Instrument FastAPI
    if settings.ENABLE_TELEMETRY:
        FastAPIInstrumentor.instrument_app(app)

    # Start bot in background
    await bot_app.start()

    yield

    # Shutdown
    logger.info("Shutting down API and Bot...")
    await bot_app.stop()


app = FastAPI(
    title=settings.APP_NAME,
    description="MeetMatch API and Bot",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint."""
    is_running = bot_app.is_running
    status_code = 200 if is_running else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if is_running else "error",
            "bot_running": is_running,
            "app": settings.APP_NAME,
            "environment": settings.ENVIRONMENT,
        },
    )


@app.get("/")
async def root() -> JSONResponse:
    """Root endpoint."""
    return JSONResponse(
        content={
            "message": "MeetMatch Bot is running",
            "docs_url": "/docs",
        }
    )
