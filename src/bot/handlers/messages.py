"""Message constants for bot responses."""

AGE_UPDATED_MESSAGE = "✅ Age updated to {age}."
AGE_UPDATE_MESSAGE = "Usage: /age <your_age> (e.g., /age 25)"

BIO_UPDATED_MESSAGE = "✅ Bio updated."
BIO_UPDATE_MESSAGE = "Usage: /bio <your_bio> (e.g., /bio Avid hiker and reader.)"

GENDER_UPDATED_MESSAGE = "✅ Gender updated to {gender}."
GENDER_UPDATE_MESSAGE = "Usage: /gender <Male|Female|Non-binary>"

INTERESTS_UPDATED_MESSAGE = "✅ Interests updated."
INTERESTS_UPDATE_MESSAGE = "Usage: /interests <interest1, interest2, ...> (e.g., /interests Hiking, Reading, Coding)"

LOCATION_UPDATED_MESSAGE = "✅ Location updated to {location}."
LOCATION_UPDATE_MESSAGE = "Usage: /location <City, Country> or use the 'Share Location' button."

NAME_UPDATED_MESSAGE = "✅ Name updated to {name}."
NAME_UPDATE_MESSAGE = "Usage: /name <your_first_name>"

PROFILE_COMPLETE_MESSAGE = (
    "👤 **Your Profile** 🌟\n\n"
    "**Name:** {name}\n"
    "**Age:** {age}\n"
    "**Gender:** {gender}\n"
    "**Bio:** {bio}\n"
    "**Interests:** {interests}\n"
    "**Location:** {location}\n\n"
    "Looking good! Use the commands below to update any info."
)

PROFILE_INCOMPLETE_MESSAGE = (
    "⚠️ **Your Profile is Incomplete!** ⚠️\n\nPlease complete the following sections to start matching:\n{missing_fields}"
)

WELCOME_MESSAGE = (
    "👋 Welcome to MeetMatch!\n\n"
    "I'm here to help you find connections based on shared interests and location. "
    "Let's get your profile set up first!"
)

REGISTRATION_MESSAGE = (
    "Looks like you're new here! Let's get you registered. Please start by setting your name with /name <your_name>."
)

PROFILE_LOCATION_PROMPT = "Please enter your location (e.g., 'City, Country'):"
LOCATION_UPDATE_MESSAGE = (
    "To update your location, either share your live location or send it manually (e.g., 'City, Country')."
)
LOCATION_UPDATED_MESSAGE = "Location updated to {location}."
LOCATION_UPDATED_SUCCESS_MESSAGE = "Your location has been successfully updated!"
INVALID_LOCATION_FORMAT_MESSAGE = (
    "Invalid location format. Please provide your location as 'City, Country' or share your location via Telegram."
)
GEOCODING_FAILED_MESSAGE = "Sorry, I couldn't find the location you provided. Please check the format (e.g., 'City, Country') or try sharing your location."
UPDATE_FAILED_MESSAGE = "Sorry, an error occurred while updating your location."
INTERNAL_ERROR_MESSAGE = "An internal error occurred. Please try again later."
