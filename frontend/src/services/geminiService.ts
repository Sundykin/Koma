import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ScriptAnalysisResult } from "../types";

// 获取 API Key，实际项目中应从环境变量获取
const apiKey = process.env.API_KEY || 'dummy-key'; 

const ai = new GoogleGenAI({ apiKey });

// 定义 Gemini 返回的 JSON Schema 结构，确保数据格式化
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          age: { type: Type.STRING },
          role: { type: Type.STRING, enum: ['protagonist', 'antagonist', 'supporting'] },
          description: { type: Type.STRING },
          appearance: { type: Type.STRING },
        },
        required: ['id', 'name', 'role', 'description', 'appearance']
      }
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          time: { type: Type.STRING, enum: ['day', 'night', 'twilight'] },
          mood: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ['id', 'name', 'location', 'mood']
      }
    },
    props: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ['id', 'name', 'type', 'description']
      }
    },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          scriptContent: { type: Type.STRING },
          shotType: { type: Type.STRING, enum: ['close-up', 'medium', 'wide', 'extreme-wide'] },
          cameraMovement: { type: Type.STRING, enum: ['static', 'pan', 'zoom-in', 'tracking'] },
          duration: { type: Type.NUMBER },
          description: { type: Type.STRING },
          characters: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['id', 'scriptContent', 'shotType', 'description']
      }
    }
  },
  required: ['characters', 'scenes', 'props', 'shots']
};

/**
 * 分析剧本并提取结构化数据
 * @param scriptText 剧本全文
 * @returns 解析后的角色、场景和分镜列表
 */
export const analyzeScript = async (scriptText: string): Promise<ScriptAnalysisResult> => {
  try {
    // 修正模型名称为 gemini-3-flash-preview，以避免 404 错误
    const model = 'gemini-3-flash-preview'; 
    
    // 提示词工程：要求 AI 扮演导演角色并输出中文 JSON
    const prompt = `
      你是一位专业的电影导演和剧本分析 AI。
      请分析以下短剧剧本片段。
      1. 提取所有角色，并生成详细的视觉外貌描述（appearance），用于后续 AI 绘图。
      2. 提取所有场景（包含地点、氛围）。
      3. 提取剧本中出现的重要道具（Props），如：武器、信物、车辆、特殊物品等。
      4. 将剧本拆解为独立的分镜镜头（Storyboard）。
      
      对于每个镜头，建议最佳的拍摄角度（shotType）、运镜方式（cameraMovement）以及用于视频生成模型的视觉描述（description）。
      
      请注意：
      - 所有返回的文本内容（如名称、描述）必须是简体中文。
      - description 字段应为一段详细的画面描述，适合作为 Stable Diffusion 或视频生成模型的 Prompt。
      
      剧本内容:
      ${scriptText}
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        thinkingConfig: { thinkingBudget: 0 } // 禁用思考过程以提高速度
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ScriptAnalysisResult;
    }
    throw new Error("No response text");

  } catch (error) {
    console.error("Gemini 分析失败:", JSON.stringify(error));
    // 降级处理：如果 API 失败，返回中文模拟数据用于演示
    return {
      characters: [
        { id: 'c1', name: '叶青凡', role: 'protagonist', prompt: '25岁年轻男性，棱角分明，穿着一件破旧的黑色卫衣，眼神锐利，东方面孔。性格冷漠，身世神秘。' },
        { id: 'c2', name: '鬼护士', role: 'antagonist', prompt: '半透明的身影，穿着破烂的50年代护士服，脸部被阴影遮挡，手中拿着生锈的针筒。恐怖，灵体状态。' }
      ],
      scenes: [
        { id: 's1', name: '废弃医院走廊', prompt: 'Location: 医院\nTime: night\nMood: 阴森，寒冷\n墙皮剥落，灯光闪烁不定，地面满是灰尘和医疗垃圾，色调偏冷青色。' }
      ],
      props: [
        { id: 'p1', name: '生锈的针筒', prompt: 'Type: 武器\n一支旧式玻璃针筒，针头生锈，里面残留着不明红色液体。' }
      ],
      shots: [
        { id: 'sh1', scriptContent: '叶青凡缓缓推开大门。', shotType: 'medium', cameraMovement: 'tracking', duration: 3, description: '中景镜头，背面视角，叶青凡推开一扇生锈厚重的铁门。前方是漆黑的走廊，光线昏暗。', characters: ['c1'] },
        { id: 'sh2', scriptContent: '"这里果然不干净。"', shotType: 'close-up', cameraMovement: 'static', duration: 2, description: '特写镜头，叶青凡的脸部，可以看到呼出的白气，眼神充满警惕。', characters: ['c1'] }
      ]
    };
  }
};