'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** true if the message belongs to the current user */
  isOwnMessage: boolean
  /** 'private' | 'group' | 'channel' | 'saved' */
  chatType: string
  /** Called when user confirms deletion */
  onDelete: (forEveryone: boolean) => void
  t: (key: string) => string
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  isOwnMessage,
  chatType,
  onDelete,
  t,
}: DeleteConfirmDialogProps) {
  const isPrivate = chatType === 'private'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            {t('msg.deleteConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('msg.deleteConfirmDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          {isPrivate && isOwnMessage && (
            <>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(true)
                  onOpenChange(false)
                }}
                className="w-full"
              >
                {t('msg.deleteForEveryone')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onDelete(false)
                  onOpenChange(false)
                }}
                className="w-full"
              >
                {t('msg.deleteForMe')}
              </Button>
            </>
          )}
          {(!isPrivate || !isOwnMessage) && (
            <Button
              variant="destructive"
              onClick={() => {
                // Groups/channels and deleting others' messages: remove for everyone.
                // Private "delete for me" on peer messages uses the outline button above
                // only when isOwnMessage; for peer messages in private we still offer
                // a single destructive action that hides for me only.
                onDelete(isPrivate ? false : true)
                onOpenChange(false)
              }}
              className="w-full"
            >
              {t('msg.delete')}
            </Button>
          )}
          <AlertDialogCancel className="w-full mt-0">
            {t('misc.cancel')}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
