import { AdminAccess } from '@frontend/src/modules/auth'
import { ChatsPage } from '@frontend/src/modules/chats'

export function AdminPage() {
  return (
    <AdminAccess>
      {({ userId, signOutAction }) => <ChatsPage adminUserId={userId} headerAction={signOutAction} />}
    </AdminAccess>
  )
}
