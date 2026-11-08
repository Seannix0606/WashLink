import type { ReactElement } from 'react'
import { RoleTabs } from '../../src/features/RoleTabs'

export default function CustomerLayout(): ReactElement {
  return (
    <RoleTabs
      role="customer"
      tabs={[
        { name: 'index', title: 'Home', icon: 'home-outline' },
        { name: 'bookings', title: 'Bookings', icon: 'calendar-outline' },
        { name: 'saved', title: 'Saved', icon: 'bookmark-outline' },
        { name: 'account', title: 'Account', icon: 'person-outline' },
      ]}
    />
  )
}
