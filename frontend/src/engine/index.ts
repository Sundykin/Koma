/**
 * Engine 模块统一导出
 *
 * P1#2 清理：MediaEngine / PlaybackEngine / VideoRenderer / AudioController /
 * KeyframeInterpolator / SnapEngine 在 src 中无任何消费者，作为死码删除。
 *
 * 当前实际在用：
 *  - SimpleMediaEngine / SimpleVideoRenderer / SimpleAudioController（simpleEngine.ts）
 *    由 components/editor/SimplePlayer.tsx 直接 new
 *  - simpleKeyframe（用于 Clip 数据模型 / SimplePlayer 等）
 *  - keyframe（用于 TrackLine 数据模型 / trackStore）
 */
export * from './keyframe';
import keyframe from './keyframe';
export { keyframe };
export default { keyframe };
