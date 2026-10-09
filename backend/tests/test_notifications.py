import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

# Import services under test
from services.email_service import send_email_alert
from services.twilio_service import send_sms_alert, send_whatsapp_alert
from services.notification_service import dispatch_all_notifications, process_risk_alert_state


class TestNotificationChannels(unittest.TestCase):
    """
    Automated test suite verifying the multi-channel notification architecture:
    1. SMTP Email functionality preserved and works.
    2. Normal SMS sends successfully.
    3. WhatsApp sends successfully.
    4. All three channels are attempted for a HIGH prediction.
    5. No notifications are sent for LOW or MEDIUM predictions.
    6. Failure in one channel does not prevent attempts on the other two.
    7. Repeated HIGH predictions do not create duplicate alerts.
    8. A later transition back to HIGH can trigger a new alert according to configured policy.
    """

    # -------------------------------------------------------------------------
    # Requirement 1: Existing SMTP email functionality still works
    # -------------------------------------------------------------------------
    @patch("services.email_service.smtplib.SMTP")
    @patch("services.email_service._get_smtp_config")
    def test_01_smtp_email_success(self, mock_smtp_config, mock_smtp_class):
        mock_smtp_config.return_value = (
            "smtp.gmail.com",
            587,
            "test_sender@gmail.com",
            "app_password_1234",
            "officer@gmail.com",
        )
        mock_server = MagicMock()
        mock_smtp_class.return_value = mock_server

        res = send_email_alert(
            temperature=45.0,
            humidity=15.0,
            soil_moisture=10.0,
            wind_speed=7.5,
            risk_level="HIGH",
            confidence=95.0,
            location="Sector Beta",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "SENT")
        self.assertEqual(res["recipient"], "officer@gmail.com")
        self.assertIsNone(res["error"])
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("test_sender@gmail.com", "app_password_1234")
        mock_server.send_message.assert_called_once()
        mock_server.quit.assert_called_once()

    # -------------------------------------------------------------------------
    # Requirement 2: Normal SMS sends successfully via Twilio
    # -------------------------------------------------------------------------
    @patch("services.twilio_service.Client")
    @patch("services.twilio_service._get_twilio_config")
    def test_02_twilio_sms_success(self, mock_twilio_config, mock_client_class):
        mock_twilio_config.return_value = {
            "account_sid": "AC_TEST_SID",
            "auth_token": "TEST_TOKEN",
            "sms_from": "+17372212163",
            "sms_to": "+918431621612",
            "whatsapp_from": "whatsapp:+17372212163",
            "whatsapp_to": "whatsapp:+918431621612",
            "content_sid": "",
        }
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_message = MagicMock()
        mock_message.sid = "SM_TEST_SMS_SID_123"
        mock_message.status = "sent"
        mock_client.messages.create.return_value = mock_message

        res = send_sms_alert(
            temperature=44.0,
            humidity=18.0,
            soil_moisture=12.0,
            wind_speed=6.0,
            risk_level="HIGH",
            location="Sector Alpha",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "SENT")
        self.assertEqual(res["recipient"], "+918431621612")
        self.assertEqual(res["message_sid"], "SM_TEST_SMS_SID_123")
        self.assertIsNone(res["error"])
        mock_client.messages.create.assert_called_once()

    # -------------------------------------------------------------------------
    # Requirement 3: WhatsApp sends successfully via Twilio
    # -------------------------------------------------------------------------
    @patch("services.twilio_service.Client")
    @patch("services.twilio_service._get_twilio_config")
    def test_03_twilio_whatsapp_success(self, mock_twilio_config, mock_client_class):
        mock_twilio_config.return_value = {
            "account_sid": "AC_TEST_SID",
            "auth_token": "TEST_TOKEN",
            "sms_from": "+17372212163",
            "sms_to": "+918431621612",
            "whatsapp_from": "whatsapp:+17372212163",
            "whatsapp_to": "whatsapp:+918431621612",
            "content_sid": "",
        }
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_message = MagicMock()
        mock_message.sid = "WA_TEST_MSG_SID_456"
        mock_message.status = "sent"
        mock_client.messages.create.return_value = mock_message

        res = send_whatsapp_alert(
            temperature=44.0,
            humidity=18.0,
            soil_moisture=12.0,
            wind_speed=6.0,
            risk_level="HIGH",
            location="Sector Alpha",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "SENT")
        self.assertEqual(res["recipient"], "whatsapp:+918431621612")
        self.assertEqual(res["message_sid"], "WA_TEST_MSG_SID_456")
        self.assertIsNone(res["error"])
        mock_client.messages.create.assert_called_once()

    # -------------------------------------------------------------------------
    # Requirement 4: All three channels are attempted for a HIGH prediction
    # -------------------------------------------------------------------------
    @patch("services.notification_service.send_whatsapp_alert")
    @patch("services.notification_service.send_sms_alert")
    @patch("services.notification_service.send_email_alert")
    def test_04_all_three_channels_attempted_on_high(
        self, mock_email, mock_sms, mock_whatsapp
    ):
        mock_email.return_value = {"success": True, "status": "SENT", "recipient": "test@test.com", "error": None}
        mock_sms.return_value = {"success": True, "status": "SENT", "recipient": "+111", "message_sid": "SM1", "error": None}
        mock_whatsapp.return_value = {"success": True, "status": "SENT", "recipient": "wa:+111", "message_sid": "WA1", "error": None}

        res = dispatch_all_notifications(
            temperature=45.0,
            humidity=14.0,
            soil_moisture=8.0,
            wind_speed=8.0,
            risk_level="HIGH",
        )

        mock_email.assert_called_once()
        mock_sms.assert_called_once()
        mock_whatsapp.assert_called_once()
        self.assertTrue(res["any_success"])
        self.assertTrue(res["email"]["success"])
        self.assertTrue(res["sms"]["success"])
        self.assertTrue(res["whatsapp"]["success"])

    # -------------------------------------------------------------------------
    # Requirement 5: No notifications are sent for LOW or MEDIUM predictions
    # -------------------------------------------------------------------------
    @patch("services.notification_service.send_whatsapp_alert")
    @patch("services.notification_service.send_sms_alert")
    @patch("services.notification_service.send_email_alert")
    def test_05_no_notifications_on_low_or_medium(
        self, mock_email, mock_sms, mock_whatsapp
    ):
        for risk in ["LOW", "MEDIUM", "Low", "medium"]:
            res = dispatch_all_notifications(
                temperature=24.0,
                humidity=65.0,
                soil_moisture=45.0,
                wind_speed=1.5,
                risk_level=risk,
            )
            # Channels should NOT be invoked
            self.assertEqual(res["email"]["status"], "SKIPPED")
            self.assertEqual(res["sms"]["status"], "SKIPPED")
            self.assertEqual(res["whatsapp"]["status"], "SKIPPED")
            self.assertFalse(res["any_success"])

        mock_email.assert_not_called()
        mock_sms.assert_not_called()
        mock_whatsapp.assert_not_called()

    # -------------------------------------------------------------------------
    # Requirement 6: Failure in one channel does not prevent attempts on the other two
    # -------------------------------------------------------------------------
    @patch("services.notification_service.send_whatsapp_alert")
    @patch("services.notification_service.send_sms_alert")
    @patch("services.notification_service.send_email_alert")
    def test_06_failure_isolation_across_channels(
        self, mock_email, mock_sms, mock_whatsapp
    ):
        # Scenario A: Email fails, SMS and WhatsApp still succeed
        mock_email.return_value = {"success": False, "status": "FAILED", "recipient": "test@test.com", "error": "SMTP Auth Error"}
        mock_sms.return_value = {"success": True, "status": "SENT", "recipient": "+111", "message_sid": "SM_OK", "error": None}
        mock_whatsapp.return_value = {"success": True, "status": "SENT", "recipient": "wa:+111", "message_sid": "WA_OK", "error": None}

        res = dispatch_all_notifications(
            temperature=46.0,
            humidity=12.0,
            soil_moisture=7.0,
            wind_speed=9.0,
            risk_level="HIGH",
        )

        self.assertFalse(res["email"]["success"])
        self.assertTrue(res["sms"]["success"])
        self.assertTrue(res["whatsapp"]["success"])
        self.assertTrue(res["any_success"])

        # Scenario B: SMS fails (e.g. trial account template restriction), Email & WhatsApp still attempt
        mock_email.reset_mock()
        mock_sms.reset_mock()
        mock_whatsapp.reset_mock()

        mock_email.return_value = {"success": True, "status": "SENT", "recipient": "test@test.com", "error": None}
        mock_sms.return_value = {"success": False, "status": "FAILED", "recipient": "+111", "message_sid": None, "error": "Twilio 572006 template required"}
        mock_whatsapp.return_value = {"success": True, "status": "SENT", "recipient": "wa:+111", "message_sid": "WA_OK", "error": None}

        res2 = dispatch_all_notifications(
            temperature=46.0,
            humidity=12.0,
            soil_moisture=7.0,
            wind_speed=9.0,
            risk_level="HIGH",
        )

        self.assertTrue(res2["email"]["success"])
        self.assertFalse(res2["sms"]["success"])
        self.assertTrue(res2["whatsapp"]["success"])
        self.assertTrue(res2["any_success"])

    # -------------------------------------------------------------------------
    # Requirement 7: Repeated HIGH predictions do not create duplicate alerts
    # -------------------------------------------------------------------------
    @patch("services.notification_service.dispatch_all_notifications")
    def test_07_repeated_high_duplicate_suppression(self, mock_dispatch):
        mock_db = MagicMock()

        # Mock previous prediction as already HIGH
        mock_prev_pred = MagicMock()
        mock_prev_pred.fire_risk = "HIGH"
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_prev_pred
        mock_db.query.return_value.order_by.return_value.first.return_value = mock_prev_pred

        # Mock last alert within cooldown (e.g. 2 minutes ago)
        mock_last_alert = MagicMock()
        mock_last_alert.created_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_last_alert

        res = process_risk_alert_state(
            db=mock_db,
            current_risk="HIGH",
            confidence=0.95,
            temperature=45.0,
            humidity=15.0,
            soil_moisture=10.0,
            wind_speed=7.0,
            async_dispatch=False,
            cooldown_minutes=30,
        )

        self.assertEqual(res["status"], "SUPPRESSED")
        mock_dispatch.assert_not_called()

    # -------------------------------------------------------------------------
    # Requirement 8: Transition from LOW/MEDIUM to HIGH triggers a new alert
    # -------------------------------------------------------------------------
    @patch("services.notification_service.dispatch_all_notifications")
    def test_08_transition_to_high_triggers_new_alert(self, mock_dispatch):
        mock_db = MagicMock()

        # Mock previous prediction as LOW
        mock_prev_pred = MagicMock()
        mock_prev_pred.fire_risk = "LOW"
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_prev_pred
        mock_db.query.return_value.order_by.return_value.first.return_value = mock_prev_pred

        mock_dispatch.return_value = {
            "email": {"success": True, "status": "SENT", "recipient": "test@test.com", "error": None},
            "sms": {"success": True, "status": "SENT", "recipient": "+111", "message_sid": "SM1", "error": None},
            "whatsapp": {"success": True, "status": "SENT", "recipient": "wa:+111", "message_sid": "WA1", "error": None},
            "any_success": True,
        }

        res = process_risk_alert_state(
            db=mock_db,
            current_risk="HIGH",
            confidence=0.96,
            temperature=45.0,
            humidity=15.0,
            soil_moisture=10.0,
            wind_speed=7.0,
            async_dispatch=False,
        )

        mock_dispatch.assert_called_once()
        self.assertTrue(res["any_success"])
        self.assertTrue(res["email"]["success"])
        self.assertTrue(res["sms"]["success"])
        self.assertTrue(res["whatsapp"]["success"])


if __name__ == "__main__":
    unittest.main()
