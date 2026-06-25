from rest_framework import serializers
from persiantools.jdatetime import JalaliDate
from datetime import date
import re

class JalaliDateField(serializers.Field):
    """
    Custom field to handle Jalali dates.
    - Accepts Jalali date string (e.g., "1378-03-12") from frontend
    - Converts to Gregorian date for storage
    - Returns Jalali date string in API responses
    """

    def to_internal_value(self, value):
        """Convert incoming Jalali date string to Gregorian date."""
        if value is None or value == '':
            return None

        if isinstance(value, date):
            return value

        if isinstance(value, str):
            match = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', value)
            if match:
                year, month, day = map(int, match.groups())
                try:
                    jalali_date = JalaliDate(year, month, day)
                    return jalali_date.to_gregorian()
                except ValueError:
                    raise serializers.ValidationError("Invalid Jalali date format.")
            else:
                raise serializers.ValidationError("Date must be in YYYY-MM-DD format.")

        raise serializers.ValidationError("Invalid date format.")

    def to_representation(self, value):
        """Convert Gregorian date from database to Jalali date string."""
        if value is None:
            return None

        if isinstance(value, date):
            jalali_date = JalaliDate.to_jalali(value)
            return str(jalali_date)  # "1378-03-12"

        return value
