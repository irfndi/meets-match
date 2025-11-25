# Migrated from src/meetsmatch/reports.py
# TODO: Cloudflare Migration
# This service needs significant refactoring:
# 1. Replace SQLAlchemy Session/Query logic with Cloudflare D1 client operations.
# 2. Update model imports: Replace '.models import Interaction, Session, User' with imports
#    from the canonical src/models (e.g., 'from ..models.user import User').
#    Note: An 'Interaction' or similar reporting model might need to be created in src/models/
#    if it doesn't exist, storing reporter_id, reported_id, reason, timestamp.
# 3. Adapt methods to work with D1 bindings passed via context (e.g., 'env.DB').
# 4. Error handling needs to be updated for D1 exceptions.

from datetime import datetime, timedelta
from typing import List, Tuple

# FIXME: These imports are from the old SQLAlchemy models in src/meetsmatch/models.py
# They need to be replaced with Pydantic models from src/models/ and D1 interaction logic.
from sqlalchemy import func
# from .models import Interaction, Session, User # Original imports, commented out


class ReportManager:
    def __init__(self):
        self.report_threshold = 3  # Number of reports before auto-ban
        self.report_window_days = 30  # Time window for counting reports
        self.report_reasons = [
            "inappropriate_content",
            "harassment",
            "spam",
            "fake_profile",
            "underage",
            "other",
        ]

    async def report_user(self, reporter_id: int, reported_id: int, reason: str) -> Tuple[bool, str]:
        """
        Report a user for inappropriate behavior.
        FIXME: This entire method needs to be rewritten for Cloudflare D1.
        """
        raise NotImplementedError("Report logic needs migration to Cloudflare D1")
        # Original SQLAlchemy logic below - for reference only
        # if reason not in self.report_reasons:
        #     return False, "Invalid report reason"
        #
        # session = Session()
        # try:
        #     reporter = session.query(User).filter_by(id=reporter_id).first()
        #     if not reporter:
        #         return False, "Reporter not found"
        #
        #     reported = session.query(User).filter_by(id=reported_id).first()
        #     if not reported:
        #         return False, "Reported user not found"
        #
        #     existing_report = (
        #         session.query(Interaction)
        #         .filter(...)
        #         .first()
        #     )
        #
        #     if existing_report:
        #         return False, "You have already reported this user"
        #
        #     report = Interaction(...)
        #     session.add(report)
        #
        #     report_count = (
        #         session.query(func.count(Interaction.id))
        #         .filter(...)
        #         .scalar()
        #     )
        #
        #     if report_count + 1 >= self.report_threshold:
        #         reported.is_active = False # FIXME: This status should be in the User model
        #         message = "User has been banned due to multiple reports"
        #     else:
        #         message = "Report submitted successfully"
        #
        #     session.commit()
        #     return True, message
        #
        # except Exception as e:
        #     session.rollback()
        #     return False, f"Error submitting report: {e!s}"
        # finally:
        #     session.close()

    async def get_user_reports(self, user_id: int) -> List[dict]: # FIXME: Return type should be List[InteractionModel]
        """Get all reports for a specific user. FIXME: Needs D1 migration."""
        raise NotImplementedError("Report logic needs migration to Cloudflare D1")
        # session = Session()
        # try:
        #     return session.query(Interaction).filter(...).all()
        # finally:
        #     session.close()

    async def get_reports_by_reason(self, days: int = 30) -> dict:
        """Get report statistics grouped by reason. FIXME: Needs D1 migration."""
        raise NotImplementedError("Report logic needs migration to Cloudflare D1")
        # session = Session()
        # try:
        #     reports = session.query(...).group_by(...).all()
        #     return dict(reports)
        # finally:
        #     session.close()

    async def get_banned_users(self) -> List[dict]: # FIXME: Return type should be List[UserModel]
        """Get list of banned users. FIXME: Needs D1 migration."""
        raise NotImplementedError("Report logic needs migration to Cloudflare D1")
        # session = Session()
        # try:
        #     # Assuming 'is_active' is a field in the User model
        #     return session.query(User).filter(User.is_active is False).all()
        # finally:
        #     session.close()


# Global instance - TODO: Consider dependency injection
report_manager = ReportManager()
