import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword, validatePassword } from '../modules/iam/crypto.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SECRETS_DIR = path.resolve(__dirname, '../../../secrets');
const CREDENTIALS_FILE = path.join(SECRETS_DIR, 'seed_credentials.json');

// 9 required test users from Step 3 § 7
const USERS_TO_SEED = [
  {
    email: 'pm.integration@example.test',
    fullName: 'Project Manager (Integration)',
    role: 'PROJECT_MANAGER',
  },
  {
    email: 'pm.validation@example.test',
    fullName: 'Project Manager (Validation)',
    role: 'PROJECT_MANAGER',
  },
  {
    email: 'lead.integration@example.test',
    fullName: 'Team Lead (Platform & Integration)',
    role: 'TEAM_LEAD',
  },
  {
    email: 'lead.validation@example.test',
    fullName: 'Team Lead (Validation & Calibration)',
    role: 'TEAM_LEAD',
  },
  {
    email: 'engineer.integration1@example.test',
    fullName: 'Integration Engineer 1',
    role: 'TEAM_MEMBER',
  },
  {
    email: 'engineer.integration2@example.test',
    fullName: 'Integration Engineer 2',
    role: 'TEAM_MEMBER',
  },
  {
    email: 'engineer.validation1@example.test',
    fullName: 'Validation Engineer 1',
    role: 'TEAM_MEMBER',
  },
  {
    email: 'engineer.calibration1@example.test',
    fullName: 'Calibration Engineer 1',
    role: 'TEAM_MEMBER',
  },
  {
    email: 'resource.manager@example.test',
    fullName: 'Resource Manager',
    role: 'RESOURCE_MANAGER',
  },
];

function generateSecureTempPassword() {
  // Generate high-entropy temp password satisfying policy: >=12 chars, upper, lower, digit, symbol
  const randBytes = crypto.randomBytes(8).toString('hex');
  return `Temp#2026_${randBytes}!`;
}

export async function generateCredentials() {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }

  let existing = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  const results = [];

  for (const user of USERS_TO_SEED) {
    let tempPassword = existing[user.email]?.password;
    if (!tempPassword) {
      tempPassword = generateSecureTempPassword();
    }

    const val = validatePassword(tempPassword);
    if (!val.valid) {
      throw new Error(`Generated temp password failed policy: ${val.error}`);
    }

    const hash = await hashPassword(tempPassword);

    existing[user.email] = {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      password: tempPassword,
      hash,
      generatedAt: new Date().toISOString(),
    };

    results.push({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      hash,
    });
  }

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(existing, null, 2), { mode: 0o600 });
  console.log(`[SeedCredentials] Seed credentials successfully generated and written to ${CREDENTIALS_FILE}`);
  return existing;
}

if (process.argv[1] && process.argv[1].endsWith('generate_seed_credentials.js')) {
  generateCredentials()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal credential generation error:', err);
      process.exit(1);
    });
}
