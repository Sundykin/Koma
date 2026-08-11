/**
 * 一次性清理：把「Koma 官方」渠道上的激活托管标记去掉，让它们变成普通渠道。
 *
 * 激活体系移除前，这些渠道的 providerConfig 上带着 managedBy: 'koma-activation' /
 * activationManaged: true，用途是：设置页禁止编辑、退出激活时连带删除、缺失时自动重建。
 * 这三条链路都已经没有了，标记留着只会变成没人维护的死数据，而且会让人误以为渠道仍受托管。
 *
 * 渠道本身保留不动（凭据就在渠道里，删了用户当场没得用），只摘掉标记 —— 摘完它们和用户
 * 自己手建的渠道完全一致，可正常编辑、删除。
 *
 * 幂等：没有标记时一行都不会写，所以每次启动跑一遍也没有代价。
 */
import { settingsDB } from '../storage/SettingsDB';

const MARKER_KEYS = ['managedBy', 'activationManaged'] as const;

export function dropActivationChannelMarkers(): number {
  const db = settingsDB.getDb();
  const rows = db
    .prepare('SELECT id, provider_config_json FROM channel_configs')
    .all() as Array<{ id: string; provider_config_json: string | null }>;

  const update = db.prepare(
    'UPDATE channel_configs SET provider_config_json = @provider_config_json WHERE id = @id',
  );
  let changed = 0;

  for (const row of rows) {
    if (!row.provider_config_json) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.provider_config_json);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    if (!MARKER_KEYS.some(key => key in parsed)) continue;

    for (const key of MARKER_KEYS) delete parsed[key];
    update.run({ id: row.id, provider_config_json: JSON.stringify(parsed) });
    changed += 1;
  }

  return changed;
}
