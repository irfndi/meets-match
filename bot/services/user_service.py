from bot.database.user_management import create_user, get_user, update_user, delete_user

class UserService:
    async def create_user(self, username, age, gender, interests):
        return await create_user(username, age, gender, interests)

    async def get_user(self, user_id):
        return await get_user(user_id)

    async def update_user(self, user_id, updates):
        return await update_user(user_id, updates)

    async def delete_user(self, user_id):
        return await delete_user(user_id)