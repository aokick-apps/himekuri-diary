import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('作業用worktreeの対象外設定', () => {
  it('.gitignoreに.claude/worktrees/が含まれる', () => {
    expect(read('.gitignore').split('\n')).toContain('.claude/worktrees/');
  });

  it('ESLintの対象外に.claude/worktrees/**が含まれる', () => {
    expect(read('eslint.config.js')).toContain("'.claude/worktrees/**'");
  });

  it('Prettierの対象外に.claude配下が含まれる', () => {
    expect(read('.prettierignore').split('\n')).toContain('.claude/**');
  });
});
