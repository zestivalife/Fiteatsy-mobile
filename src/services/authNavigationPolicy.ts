export type PostSignupDestination =
  | { name: 'ChangePin'; params: { force: true; initialSetup: true } }
  | { name: 'ChangePin'; params: { force: true } }
  | { name: 'Splash' };

export const resolvePostSignupDestination = (
  requiresPinSetup: boolean | undefined,
  requiresPinChange: boolean | undefined = false
): PostSignupDestination =>
  requiresPinSetup === true
    ? { name: 'ChangePin', params: { force: true, initialSetup: true } }
    : requiresPinChange === true
      ? { name: 'ChangePin', params: { force: true } }
    : { name: 'Splash' };
