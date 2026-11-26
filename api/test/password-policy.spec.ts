import { COMMON_PASSWORDS } from '../src/auth/common-passwords';
import { WEAK_PASSWORD, weakPassword } from '../src/auth/password-policy';

const EMAIL = 'radu.dogaru@ulbsibiu.ro';

describe('new password check (D-030)', () => {
  it('refuses a common password whatever its case, and accepts an unusual one', () => {
    expect(weakPassword('qwertyuiop', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('QwertyUIOP', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('1234567890', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('cal-verde-sare-gardul-77', EMAIL)).toBeNull();
  });

  it('refuses one repeated character', () => {
    expect(weakPassword('zzzzzzzzzzzz', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('!!!!!!!!!!', EMAIL)).toBe(WEAK_PASSWORD);
  });

  it("refuses the email's name part or a piece of it of at least 4 characters, whatever the case", () => {
    expect(weakPassword('xx-radu.dogaru-xx', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('Dogaru2026!', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('cine-e-RADU-azi', EMAIL)).toBe(WEAK_PASSWORD);
    expect(weakPassword('copac-dogar-7', 'ana_maria-pop@ulbsibiu.ro')).toBeNull();
    expect(weakPassword('maria-e-acasa-1', 'ana_maria-pop@ulbsibiu.ro')).toBe(WEAK_PASSWORD);
  });

  it('ignores pieces of the name shorter than 4 characters', () => {
    expect(weakPassword('pop-ana-merg-la-munte', 'ana.pop@ulbsibiu.ro')).toBeNull();
    expect(weakPassword('zi-de-ana.pop-77', 'ana.pop@ulbsibiu.ro')).toBe(WEAK_PASSWORD);
  });

  it('keeps a list of unique lowercase entries of at least 10 characters', () => {
    const entries = COMMON_PASSWORDS.split('\n');
    expect(entries.length).toBeGreaterThan(9000);
    expect(new Set(entries).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.length).toBeGreaterThanOrEqual(10);
      expect(entry).toBe(entry.toLowerCase());
    }
  });
});

describe('short email names (D-030, code review)', () => {
  it('ignores a whole name part shorter than 4 characters, and still refuses the longer pieces', () => {
    expect(weakPassword('Cabana-de-munte-2026', 'ab@ulbsibiu.ro')).toBeNull();
    expect(weakPassword('o-zi-la-mare-2026', 'a@ulbsibiu.ro')).toBeNull();
    expect(weakPassword('Dogaru2026!', 'radu.dogaru@ulbsibiu.ro')).toBe(WEAK_PASSWORD);
    expect(weakPassword('salut-ana.pop-77', 'ana.pop@ulbsibiu.ro')).toBe(WEAK_PASSWORD);
  });
});
