/* ============================================================
 * 磐城遇见 · 系统配置文件
 * ------------------------------------------------------------
 * 正式上线：把下面 SUPABASE_URL 和 SUPABASE_ANON_KEY 两项
 * 换成您自己的 Supabase 项目信息（详见 DEPLOY.md 部署指南）。
 *
 * 两项留空时，网站自动进入【本地演示模式】：
 *   · 数据只保存在当前浏览器里，换设备/换浏览器互不相通
 *   · 适合先熟悉功能、给领导演示
 *   · 演示账号：13800000001 / 13800000002 / 13800000003，密码均为 123456
 *   · 演示模式管理后台密码：admin888
 * ============================================================ */

const SUPABASE_URL = "https://luuriwsqjrvwvfmasjiz.supabase.co";  // 您的 Supabase 项目
const SUPABASE_ANON_KEY = "sb_publishable_HMBruCUbWDNhXrbgtpfoQg__ANlDGVv";   // 公开密钥（publishable key）

/* ---------- 以下为平台固定配置，一般无需修改 ---------- */

// 每天最多打招呼次数（防骚扰）
const DAILY_GREET_LIMIT = 10;

// 照片上限（张）
const MAX_LIFE_PHOTOS = 3;    // 生活照
const MAX_DAILY_PHOTOS = 6;   // 我想分享的照片

// 照片压缩参数（前端自动压缩，用户无感）
const PHOTO_MAX_EDGE = 1080;  // 最长边像素
const PHOTO_QUALITY  = 0.75;  // JPEG 质量

// 管理员联系方式（忘记密码时展示给用户，请改成实际负责人）
const ADMIN_CONTACT = "磐城遇见管理员（团县委）";

// 打招呼留言最大长度
const GREET_MSG_MAX = 50;

// 忘记密码时管理员重置的默认格式说明
const PLATFORM_NAME = "磐城遇见";
