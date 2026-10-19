// Passwords that meet the "8+ characters with a letter and a digit" rule but sit at the top of
// every leaked-password list (or are published, like the demo password). Lower case; compared
// case-insensitively.
const COMMON_PASSWORDS = new Set([
  // password
  'password1', 'password2', 'password7', 'password9', 'password01', 'password12', 'password123', 'password1234',
  'password12345', 'password2024', 'password2025', 'password2026', '1password', '123password', 'passw0rd', 'p@ssw0rd',
  'p@ssword1', 'pa55word', 'pa55w0rd', 'passw0rd1', 'password@1', 'password@123', 'pass1234', 'pass12345', 'pass@123',
  'pass@1234', 'mypass123', 'mypassword1',
  // keyboard walks
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwerty01', 'qwerty123456', 'qwer1234', '1234qwer', 'qwe12345',
  'qwe123qwe', '123qwe123', '123qweasd', '12345qwe', 'q1w2e3r4', 'q1w2e3r4t5', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r5t6y',
  '1qaz2wsx', '1qazxsw2', 'zaq12wsx', 'zaq1zaq1', 'zaq1xsw2', 'qazwsx123', 'qaz123wsx', 'asdf1234', 'asd12345',
  'asdfgh123', 'zxcvbn123', 'zxc12345', 'qwertyui1',
  // letters and digits in a row
  'abc12345', 'abc123456', 'abcd1234', 'abcd12345', 'abcdef123', 'abcdef12', 'a1b2c3d4', 'a1234567', 'a12345678',
  '1234abcd', '12345abc', '123456ab', 'aa123456', 'aa12345678', 'qq123456', 'abc@1234', 'abcd@1234', '123abc123',
  // admin and defaults
  'admin123', 'admin1234', 'admin12345', 'admin@123', 'administrator1', 'root1234', 'changeme1', 'changeme123',
  'default1', 'test1234', 'test12345', 'testing123', 'temp1234', 'guest123', 'user1234', 'login123', 'secret123',
  'welcome1', 'welcome12', 'welcome123', 'welcome2024', 'welcome2025', 'welcome2026', 'welcome@123',
  // words with digits
  'letmein1', 'letmein123', 'iloveyou1', 'iloveyou2', 'iloveyou123', 'trustno1', 'monkey123', 'dragon123', 'master123',
  'shadow123', 'sunshine1', 'princess1', 'football1', 'football123', 'baseball1', 'superman1', 'batman123', 'michael1',
  'jennifer1', 'jordan23', 'charlie1', 'hello123', 'hello1234', 'freedom1', 'whatever1', 'computer1', 'internet1',
  'starwars1', 'pokemon1', 'liverpool1', 'chelsea1', 'arsenal1', 'hunter12', 'killer123', 'loveme123', 'family123',
  'samsung1', 'samsung123', 'google123', 'apple123', 'facebook1', 'student1', 'student123', 'cricket1', 'cricket123',
  'summer2024', 'summer2025', 'summer2026', 'winter2025', 'winter2026',
  // local
  'india123', 'india@123', 'india1234', 'bharat123', 'mumbai123', 'delhi123', 'gurgaon123', 'gurugram1', 'gurugram123',
  // the gym, and the published demo password
  'pulse123', 'pulse1234', 'pulse@123', 'pulsefit1', 'pulsefit12', 'pulsefit123', 'pulsefit2025', 'pulsefit2026',
  'pulsefit@1', 'pulsefit@123', 'gym12345', 'gym123456', 'gymlife1', 'gymrat123', 'fitness1', 'fitness123',
  'workout1', 'workout123', 'muscle123', 'strong123', 'cardio123', 'zumba123', 'trainer1', 'member123'
]);

/** True for a password on the built-in list of common ones, whatever its letter case. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
