import { Button, EmptyState } from '@/components/drive/ui'
import { DRIVE } from '@/lib/drive/routes'

export default function DriveNotFound() {
  return (
    <div className="dr-container dr-page">
      <EmptyState
        icon="compass"
        title="That page is not on the map"
        body="The car may have been unlisted, or the link is missing a piece."
        action={
          <div className="dr-row">
            <Button href={DRIVE.cars}>Explore cars</Button>
            <Button href={DRIVE.home} variant="secondary">
              Drive home
            </Button>
          </div>
        }
      />
    </div>
  )
}
