const bcrypt = require('bcrypt');
const prisma = require('../services/prisma');

async function main() {
  const email = 'admin@miniecom.local';
  const passwordHash = await bcrypt.hash('admin123456', 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName: 'Petshop Admin', role: 'admin' },
  });
  console.log('Admin sẵn sàng:', admin.email);
}

main().finally(() => prisma.$disconnect());
