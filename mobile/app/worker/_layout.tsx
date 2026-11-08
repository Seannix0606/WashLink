import type { ReactElement } from 'react'
import { RoleTabs } from '../../src/features/RoleTabs'

export default function WorkerLayout(): ReactElement {
  return (
    <RoleTabs
      role="worker"
      tabs={[
        { name: 'index', title: 'Work', icon: 'briefcase-outline' },
        { name: 'history', title: 'Earnings', icon: 'wallet-outline' },
        { name: 'setup', title: 'Profile', icon: 'options-outline' },
        { name: 'account', title: 'Account', icon: 'person-outline' },
      ]}
    />
  )
}
