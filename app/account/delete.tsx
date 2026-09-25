/**
 * Delete my account.
 *
 * Reachable from every role's profile, because the right to delete is not a
 * feature of one kind of user. Whether it is *allowed* right now is the
 * database's decision, shown here before the person commits to anything, so
 * nobody types their confirmation only to be told no.
 *
 * The confirmation is typed rather than tapped. This cannot be undone, the
 * button sits where a thumb rests, and a single tap is how people delete
 * things they meant to keep.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Banner, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { ORGANISATION } from '@/config';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { accountService, type DeletionBlocker } from '@/services/account.service';
import { spacing } from '@/theme';

const CONFIRMATION_WORD = 'DELETE';

/** What is removed, in the words a person would use for it. */
const WHAT_IS_REMOVED = [
  'Your profile, email address and phone number',
  'Every application you have started or submitted, including any that were not approved',
  'Every document you uploaded — your ID, photographs and business documents',
  'Any progress reports, photos and videos',
  'Your notifications, and this phone’s link to them',
];

function blockerMessage(blocker: DeletionBlocker): { title: string; message: string } {
  switch (blocker) {
    case 'staff':
      return {
        title: 'Staff accounts are managed by the church',
        message:
          'Your account has committee or administrator access, and deleting it would also delete '
          + 'the reviews and decisions you have recorded. Ask an administrator to change your role '
          + 'back to applicant first, then you can delete it here.',
      };
    case 'grant_on_record':
      return {
        title: 'Your grant record has to be kept',
        message:
          'You have a signed grant agreement, so your application is the church’s record of money '
          + `committed to you. Please contact ${ORGANISATION.name} at ${ORGANISATION.supportEmail} `
          + 'to ask for your account to be closed.',
      };
    case 'not_signed_in':
      return {
        title: 'Please sign in again',
        message: 'Your session has expired. Sign out, sign back in, and return here.',
      };
    default:
      return {
        title: 'This account cannot be deleted from the app',
        message: `Please contact ${ORGANISATION.name} at ${ORGANISATION.supportEmail}.`,
      };
  }
}

/**
 * A refusal that says "contact the church" should come with a way to do it.
 * Opens the person's email app with the address and subject filled in; staff
 * are not offered this because their route is an administrator, not an email.
 */
function emailTheChurch() {
  const subject = encodeURIComponent('Please close my ZWCC Business Grant account');
  void Linking.openURL(`mailto:${ORGANISATION.supportEmail}?subject=${subject}`).catch(() => {
    // No email app. The address is on screen, so there is nothing to add.
  });
}

export default function DeleteAccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  const blocker = useQuery({
    queryKey: ['account', 'deletion-blocker'],
    queryFn: () => accountService.getDeletionBlocker(),
    // Always ask fresh: a role or an application can change between visits.
    staleTime: 0,
    gcTime: 0,
  });

  const confirmed = typed.trim().toUpperCase() === CONFIRMATION_WORD;

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    try {
      await accountService.deleteAccount();
    } catch (error) {
      setDeleting(false);
      toast.error(error, 'Account not deleted');
      // A refusal may mean the rule changed while the screen was open.
      void blocker.refetch();
      return;
    }

    // The account is gone. Remove this phone's copies too, then leave. The
    // session is already invalid, so sign-out only has local work left to do.
    queryClient.clear();
    await accountService.clearLocalData();
    await signOut();
    toast.success('Account deleted', 'Your account and everything in it have been removed.');
    router.replace('/');
  }

  if (blocker.isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Delete account" showBack />
        <LoadingState message="Checking your account…" />
      </Screen>
    );
  }

  const blocked = blocker.data ? blockerMessage(blocker.data) : null;

  return (
    <Screen
      footer={
        blocked && blocker.data !== 'staff' && blocker.data !== 'not_signed_in' ? (
          <Button
            label="Email the church"
            variant="outline"
            icon="mail-outline"
            onPress={emailTheChurch}
            fullWidth
            size="lg"
          />
        ) : blocked || blocker.isError ? undefined : (
          <Button
            label="Delete my account permanently"
            variant="danger"
            icon="trash-outline"
            onPress={() => void handleDelete()}
            disabled={!confirmed}
            loading={deleting}
            fullWidth
            size="lg"
          />
        )
      }
    >
      <ScreenHeader
        title="Delete account"
        subtitle={
          // Promising removal above a message that refuses it reads as a
          // contradiction, so the warning only appears when deletion is open.
          blocked || blocker.isError
            ? undefined
            : 'This removes your account and everything in it. It cannot be undone.'
        }
        showBack
      />

      {blocker.isError ? (
        <Banner
          tone="warning"
          title="Could not check your account"
          message="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => void blocker.refetch() }}
        />
      ) : blocked ? (
        <Banner tone="info" title={blocked.title} message={blocked.message} icon="information-circle-outline" />
      ) : (
        <View style={styles.body}>
          <Text variant="bodyMedium">What will be deleted</Text>
          <View style={styles.list}>
            {WHAT_IS_REMOVED.map((line) => (
              <Text key={line} variant="body" color="textSecondary">
                •  {line}
              </Text>
            ))}
          </View>

          <Banner
            tone="warning"
            title="This is permanent"
            message="Nobody at the church can restore a deleted account. If you apply again later, you will start from the beginning."
          />

          <TextField
            label={`Type ${CONFIRMATION_WORD} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
            accessibilityHint={`Deleting is only possible once you have typed ${CONFIRMATION_WORD}`}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.base },
  list: { gap: spacing.xs },
});
