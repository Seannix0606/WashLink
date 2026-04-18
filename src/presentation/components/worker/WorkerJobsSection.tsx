import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Booking } from '../../../domain/models/Booking'
import { EmptyState, Tabs, type TabItemDefinition } from '../../design/ui'
import { WorkerJobCard } from './WorkerJobCard'

type WorkerJobsTabKey = 'active' | 'completed'

interface WorkerJobsSectionProps {
  readonly assignedBookingList: readonly Booking[]
  readonly workerIdentifier: string
  readonly onStartWorkerJob: (bookingIdentifier: string) => Promise<void>
  readonly onCompleteWorkerJob: (bookingIdentifier: string) => Promise<void>
}

export function WorkerJobsSection({
  assignedBookingList,
  workerIdentifier,
  onStartWorkerJob,
  onCompleteWorkerJob,
}: WorkerJobsSectionProps): ReactElement {
  const [selectedTab, setSelectedTab] = useState<WorkerJobsTabKey>('active')

  const activeBookingList = useMemo(
    () =>
      assignedBookingList.filter(
        (booking) =>
          booking.bookingStatus === 'accepted' ||
          booking.bookingStatus === 'in_progress',
      ),
    [assignedBookingList],
  )
  const completedBookingList = useMemo(
    () =>
      assignedBookingList.filter(
        (booking) => booking.bookingStatus === 'completed',
      ),
    [assignedBookingList],
  )

  const tabItems: TabItemDefinition<WorkerJobsTabKey>[] = [
    {
      value: 'active',
      label: 'Active',
      badgeContent: activeBookingList.length,
    },
    {
      value: 'completed',
      label: 'Completed',
      badgeContent: completedBookingList.length,
    },
  ]

  const visibleBookings =
    selectedTab === 'active' ? activeBookingList : completedBookingList

  return (
    <section className="space-y-4">
      <Tabs
        accessibleLabel="Worker jobs filter"
        tabItems={tabItems}
        activeTabValue={selectedTab}
        onTabChange={setSelectedTab}
      />

      {visibleBookings.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title={
            selectedTab === 'active'
              ? 'No active jobs'
              : 'No completed jobs yet'
          }
          description={
            selectedTab === 'active'
              ? 'When the owner assigns you a booking, it appears here.'
              : 'Jobs you complete will be listed here.'
          }
        />
      ) : (
        <motion.ul
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
        >
          {visibleBookings.map((booking) => (
            <motion.li
              key={booking.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <WorkerJobCard
                booking={booking}
                workerIdentifier={workerIdentifier}
                onStartWorkerJob={onStartWorkerJob}
                onCompleteWorkerJob={onCompleteWorkerJob}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  )
}
