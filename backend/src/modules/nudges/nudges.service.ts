export const canSendNudge = (params: {
  now: Date;
  inMeeting: boolean;
  nudgesSentToday: number;
}) => {
  const hour = params.now.getHours();
  if (hour < 8 || hour >= 20) {
    return false;
  }
  if (params.inMeeting) {
    return false;
  }
  if (params.nudgesSentToday >= 3) {
    return false;
  }
  return true;
};
