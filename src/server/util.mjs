export function getTimeStampForLoglines() {
  const now = new Date();
  const options = { timeZone: 'America/Los_Angeles', hour12: false };
  const pacificTimeString = '\n========= [' + now.toLocaleString('en-US', options) + '.' + now.getMilliseconds().toString().padStart(3, '0') + ']: ';
  return pacificTimeString;
}
