"""
IGNITE SHIELD - Live Integration Test for Multi-Channel Notifications
Tests actual provider delivery across:
1. Gmail SMTP Email
2. Twilio Normal SMS
3. Twilio WhatsApp

Usage:
    python tests/integration_test_live.py
"""

import sys
import os
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from services.email_service import send_email_test_alert, _get_smtp_config
from services.twilio_service import send_sms_test_alert, send_whatsapp_test_alert, _get_twilio_config
from services.notification_service import dispatch_all_notifications


def run_live_integration_tests():
    print("=" * 70)
    print("[IGNITE SHIELD] LIVE NOTIFICATION INTEGRATION TEST")
    print("=" * 70)

    # 1. Inspect Configurations
    smtp_host, smtp_port, smtp_email, _, alert_email = _get_smtp_config()
    twilio_cfg = _get_twilio_config()

    print("\n[1] CONFIGURATION AUDIT")
    print(f"  • SMTP Host:        {smtp_host}:{smtp_port}")
    print(f"  • SMTP Sender:      {smtp_email}")
    print(f"  • Alert Email:      {alert_email}")
    print(f"  • Twilio Account:   {twilio_cfg['account_sid'][:8]}... (configured)")
    print(f"  * SMS From:         {twilio_cfg['sms_from']}")
    print(f"  * SMS To:           {twilio_cfg['sms_to']}")
    print(f"  * WhatsApp From:    {twilio_cfg['whatsapp_from']}")
    print(f"  * WhatsApp To:      {twilio_cfg['whatsapp_to']}")

    # 2. Test Gmail SMTP Email
    print("\n[2] TESTING CHANNEL 1: Gmail SMTP Email...")
    try:
        email_res = send_email_test_alert(
            temperature=42.0,
            humidity=18.0,
            soil_moisture=12.0,
            wind_speed=5.5,
            location="Forest Sector Alpha (Integration Test)",
        )
        if email_res["success"]:
            print(f"  [+] Email SUCCESS: Delivered to {email_res.get('recipient')}")
        else:
            print(f"  [-] Email FAILED: {email_res.get('error')}")
    except Exception as e:
        print(f"  [-] Email Exception: {e}")

    # 3. Test Twilio SMS
    print("\n[3] TESTING CHANNEL 2: Twilio Normal SMS...")
    try:
        sms_res = send_sms_test_alert(
            temperature=42.0,
            humidity=18.0,
            soil_moisture=12.0,
            wind_speed=5.5,
            location="Forest Sector Alpha (Integration Test)",
        )
        if sms_res["success"]:
            print(f"  [+] SMS SUCCESS: SID = {sms_res.get('message_sid')} (Recipient: {sms_res.get('recipient')})")
        else:
            print(f"  [!] SMS Response: {sms_res.get('error')}")
            print("     Note: Trial accounts require verified numbers or predefined SMS templates in certain regions.")
    except Exception as e:
        print(f"  [-] SMS Exception: {e}")

    # 4. Test Twilio WhatsApp
    print("\n[4] TESTING CHANNEL 3: Twilio WhatsApp...")
    try:
        wa_res = send_whatsapp_test_alert(
            temperature=42.0,
            humidity=18.0,
            soil_moisture=12.0,
            wind_speed=5.5,
            location="Forest Sector Alpha (Integration Test)",
        )
        if wa_res["success"]:
            print(f"  [+] WhatsApp SUCCESS: SID = {wa_res.get('message_sid')} (Recipient: {wa_res.get('recipient')})")
        else:
            print(f"  [!] WhatsApp Response: {wa_res.get('error')}")
            print("     Note: To receive WhatsApp messages on a Twilio trial account, recipient must join sandbox.")
    except Exception as e:
        print(f"  [-] WhatsApp Exception: {e}")

    # 5. Test Unified Coordinator (Simultaneous Dispatch)
    print("\n[5] TESTING SIMULTANEOUS 3-CHANNEL COORDINATOR...")
    try:
        coord_res = dispatch_all_notifications(
            temperature=44.5,
            humidity=16.0,
            soil_moisture=11.0,
            wind_speed=6.8,
            risk_level="HIGH",
            location="Forest Sector Alpha (Coordinator Test)",
        )
        print(f"  * Email Channel:    {coord_res['email']['status']}")
        print(f"  * SMS Channel:      {coord_res['sms']['status']}")
        print(f"  * WhatsApp Channel: {coord_res['whatsapp']['status']}")
        print(f"  * Any Success:      {coord_res['any_success']}")
    except Exception as e:
        print(f"  [-] Coordinator Exception: {e}")

    print("\n" + "=" * 70)
    print("INTEGRATION TEST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    run_live_integration_tests()
