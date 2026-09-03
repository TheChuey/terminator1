"""
app/tools/datetime_tools.py
===========================

Date and time tools.
"""

from datetime import datetime


def get_current_date() -> str:
    """Returns the real current date as a formatted string."""
    return datetime.now().strftime("%A, %B %d, %Y")


def tell_me_the_date_and_time() -> str:
    """Returns the current date and time."""
    now = datetime.now()
    return f"The current date and time is {now.strftime('%Y-%m-%d %H:%M:%S')}"
