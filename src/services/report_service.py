# TODO: Cloudflare Migration Complete (except where noted)
# This service needs significant refactoring:
# 1. Replace SQLAlchemy Session/Query logic with Cloudflare D1 client operations. - DONE
# 2. Update model imports: Replace '.models import Interaction, Session, User' with imports
#    from the canonical src/models (e.g., 'from ..models.user import User'). - DONE
#    Note: An 'Interaction' or similar reporting model might need to be created in src/models/
#    if it doesn't exist, storing reporter_id, reported_id, reason, timestamp. - DONE (src.models.report.Report)
# 3. Adapt methods to work with D1 bindings passed via context (e.g., 'env.DB'). - DONE
# 4. Error handling needs to be updated for D1 exceptions. - DONE

from datetime import datetime, timedelta
from typing import List, Tuple

import structlog

from ..config import Settings
from ..models.report import ALLOWED_REPORT_REASONS, Report
from ..models.user import User
from ..utils.errors import DatabaseError, NotFoundError, ValidationError
from .user_service import get_user, update_user

# Constants moved outside the class
REPORT_THRESHOLD = 3  # Number of reports before auto-ban
REPORT_WINDOW_DAYS = 30  # Time window for counting reports

logger = structlog.get_logger()


async def report_user(env: Settings, reporter_id: str, reported_id: str, reason: str) -> Tuple[bool, str]:
    """Report a user for inappropriate behavior.

    Args:
        env: Cloudflare environment object with bindings.
        reporter_id: ID of the user making the report.
        reported_id: ID of the user being reported.
        reason: Reason for the report (must be in ALLOWED_REPORT_REASONS).

    Returns:
        Tuple[bool, str]: (success status, message).

    Raises:
        NotFoundError: If reporter or reported user doesn't exist.
        ValidationError: If reason is invalid or DB operation fails.
    """
    if reporter_id == reported_id:
        return False, "You cannot report yourself."

    if reason not in ALLOWED_REPORT_REASONS:
        logger.warning("Invalid report reason attempt", reporter=reporter_id, reported=reported_id, reason=reason)
        return False, f"Invalid report reason. Must be one of: {ALLOWED_REPORT_REASONS}"

    try:
        # 1. Validate users exist and are active
        try:
            reporter_user = await get_user(env, reporter_id)
            if not reporter_user.is_active:
                return False, "Reporter account is inactive."
        except NotFoundError:
            logger.error("Reporter not found during report process", reporter=reporter_id)
            return False, "Reporter not found."

        # 2. Validate reported user exists (allow reporting inactive users for now)
        try:
            _ = await get_user(env, reported_id)  # Assign to _ as we only check existence
            # Optional: Check if reported_user.is_active and decide behavior
        except NotFoundError:
            logger.error("Reported user not found during report process", reported=reported_id)
            return False, "Reported user not found."

        # 3. Check if already reported recently
        window_start = datetime.now() - timedelta(days=env.settings.report_ban_window_days)
        try:
            # TODO: Verify 'reports' table name and columns
            check_stmt = env.DB.prepare(
                "SELECT id FROM reports WHERE reporter_id = ? AND reported_id = ? AND created_at >= ? LIMIT 1"
            )
            existing = await check_stmt.bind(reporter_id, reported_id, window_start.isoformat()).first()
            if existing:
                logger.info("Duplicate report attempt within window", reporter=reporter_id, reported=reported_id)
                return False, "You have already reported this user recently."

        except Exception as e:
            logger.error(
                "D1 error checking existing report",
                reporter=reporter_id,
                reported=reported_id,
                error=str(e),
                exc_info=True,
            )
            raise DatabaseError("Failed to check for existing reports") from e

        # 4. Create and insert the new report
        new_report = Report(reporter_id=reporter_id, reported_id=reported_id, reason=reason)
        try:
            # TODO: Verify 'reports' table name and columns
            insert_stmt = env.DB.prepare(
                "INSERT INTO reports (id, reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?, ?)"
            )
            await insert_stmt.bind(
                new_report.id,
                new_report.reporter_id,
                new_report.reported_id,
                new_report.reason,
                new_report.created_at.isoformat(),
            ).run()
            logger.info(
                "Report submitted successfully",
                report_id=new_report.id,
                reporter=reporter_id,
                reported=reported_id,
                reason=reason,
            )

        except Exception as e:
            logger.error(
                "D1 error inserting report",
                reporter=reporter_id,
                reported=reported_id,
                reason=reason,
                error=str(e),
                exc_info=True,
            )
            raise DatabaseError("Failed to submit report") from e

        # 5. Count total reports against the reported user within the window
        try:
            # TODO: Verify 'reports' table name and columns
            count_stmt = env.DB.prepare(
                "SELECT COUNT(id) as report_count FROM reports WHERE reported_id = ? AND created_at >= ?"
            )
            count_result = await count_stmt.bind(reported_id, window_start.isoformat()).first()
            report_count = count_result["report_count"] if count_result else 0

        except Exception as e:
            logger.error(
                "D1 error counting reports for user",
                reported=reported_id,
                error=str(e),
                exc_info=True,
            )
            # Continue without banning if count fails, but log it
            return True, "Report submitted, but failed to check report count."

        # 6. Check threshold and potentially ban user
        message = "Report submitted successfully."
        if report_count >= REPORT_THRESHOLD:
            logger.warning("Report threshold reached, banning user", reported=reported_id, count=report_count)
            try:
                await update_user(env, reported_id, {"is_active": False})  # Deactivate user
                message = "Report submitted successfully. User has been banned due to multiple reports."

                # Clear cache for the banned user
                try:
                    # await clear_user_cache(env, reported_id)
                    pass
                except Exception as e_cache:
                    logger.error("Failed to clear cache for banned user", user_id=reported_id, error=str(e_cache))

            except Exception as e:
                logger.error(
                    "D1 error banning user after report threshold",
                    reported=reported_id,
                    error=str(e),
                    exc_info=True,
                )
                message = "Report submitted, but failed to deactivate user."

        return True, message

    except NotFoundError as e:
        # This top-level NotFoundError should not be reached if individual checks work,
        # but acts as a fallback.
        logger.error("Unexpected NotFoundError during report operation", error=str(e), exc_info=True)
        return False, "An error occurred while verifying users."

    except DatabaseError as e:
        # Errors from D1 operations (prepare, bind, run, first) caught here
        logger.error(
            "D1 database error during report operation",
            reporter=reporter_id,
            reported=reported_id,
            error=str(e),
            exc_info=True,
        )
        return False, "A database error occurred while processing the report."

    except Exception as e:  # Catch-all for other unexpected errors
        # Catch other potential D1 errors or unexpected issues
        logger.error(
            "Unexpected error during report operation",
            reporter=reporter_id,
            reported=reported_id,
            error=str(e),
            exc_info=True,
        )
        return False, "An unexpected error occurred."


async def get_user_reports(env: Settings, user_id: str) -> List[Report]:
    """Get all reports filed against a specific user.

    Args:
        env: Cloudflare environment object.
        user_id: The ID of the user whose reports are being requested.

    Returns:
        A list of Report objects filed against the user.

    Raises:
        DatabaseError: If the database query fails.
    """
    logger.debug("Fetching reports for user", user_id=user_id)
    try:
        # TODO: Verify 'reports' table name and columns
        stmt = env.DB.prepare("SELECT * FROM reports WHERE reported_id = ? ORDER BY created_at DESC")
        results = await stmt.bind(user_id).all()

        if not results or not results["results"]:
            logger.info("No reports found for user", user_id=user_id)
            return []

        reports = [Report.model_validate(row) for row in results["results"]]
        logger.info("Retrieved reports for user", user_id=user_id, count=len(reports))
        return reports

    except Exception as e:
        logger.error(
            "D1 error fetching reports for user",
            user_id=user_id,
            error=str(e),
            exc_info=True,
        )
        raise DatabaseError(f"Failed to retrieve reports for user {user_id}") from e


async def get_reports_by_reason(env: Settings, days: int = 30) -> dict:
    """Get report statistics grouped by reason within a time window.

    Args:
        env: Cloudflare environment object.
        days: The time window in days to consider reports.

    Returns:
        A dictionary where keys are report reasons and values are counts.

    Raises:
        DatabaseError: If the database query fails.
    """
    logger.debug("Fetching report counts by reason", days=days)
    window_start = datetime.now() - timedelta(days=days)
    try:
        # TODO: Verify 'reports' table name and columns
        stmt = env.DB.prepare("SELECT reason, COUNT(id) as count FROM reports WHERE created_at >= ? GROUP BY reason")
        results = await stmt.bind(window_start.isoformat()).all()

        if not results or not results["results"]:
            logger.info("No reports found within the time window", days=days)
            return {}

        # Convert list of {'reason': 'spam', 'count': 5} to {'spam': 5}
        report_counts = {row["reason"]: row["count"] for row in results["results"]}

        logger.info("Retrieved report counts by reason", days=days, counts=report_counts)
        return report_counts

    except Exception as e:
        logger.error(
            "D1 error fetching reports by reason",
            days=days,
            error=str(e),
            exc_info=True,
        )
        raise DatabaseError("Failed to retrieve report statistics") from e


async def get_banned_users(env: Settings) -> List[User]:
    """Get list of users marked as inactive (banned).

    Args:
        env: Cloudflare environment object.

    Returns:
        A list of User objects for inactive users.

    Raises:
        DatabaseError: If the database query fails.
    """
    logger.debug("Fetching banned (inactive) users")
    try:
        # TODO: Verify 'users' table name and 'is_active' column name/convention (0 for False)
        stmt = env.DB.prepare("SELECT * FROM users WHERE is_active = 0")
        results = await stmt.all()

        if not results or not results["results"]:
            logger.info("No banned users found")
            return []

        # Validate each row against the User model
        # Need careful validation as D1 returns JSON which might miss fields
        # or have incorrect types compared to the Pydantic model.
        banned_users = []
        for row in results["results"]:
            try:
                # Convert is_active from 0/1 to False/True if necessary
                # Pydantic bool field should handle 0/1 automatically, but check if issues arise
                user = User.model_validate(row)
                banned_users.append(user)
            except ValidationError as e:
                logger.error("Failed to validate user data from D1", user_data=row, error=str(e))
                # Optionally skip this user or raise a more specific error
                continue

        logger.info("Retrieved banned users", count=len(banned_users))
        return banned_users

    except Exception as e:
        logger.error(
            "D1 error fetching banned users",
            error=str(e),
            exc_info=True,
        )
        raise DatabaseError("Failed to retrieve banned users") from e
