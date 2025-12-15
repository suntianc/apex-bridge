---
name: "siliconflow-image-generator"
description: "当用户说'生成图片'、'创建图像'、'AI绘图'、'画一张图'、'根据描述生成图片'或'图片生成'时，调用SiliconFlow API根据文本提示词或参考图片生成高质量图像，支持批量生成、风格控制和自定义参数"
version: "1.0.0"
author: "ApexBridge Team"
category: "image-generation"
tags: ["image", "generation", "ai", "siliconflow", "text-to-image", "img2img"]
parameters:
  type: "object"
  properties:
    prompt:
      type: "string"
      description: "图像描述提示词，详细描述想要生成的图像内容"
    negative_prompt:
      type: "string"
      description: "负面提示词，描述不想要的元素"
      default: ""
    image_size:
      type: "string"
      description: "输出图像尺寸，格式如'512x512'"
      default: "512x512"
    batch_size:
      type: "integer"
      description: "批量生成图片数量（1-4）"
      default: 1
      minimum: 1
      maximum: 4
    seed:
      type: "integer"
      description: "随机种子（-1表示随机）"
      default: -1
    num_inference_steps:
      type: "integer"
      description: "推理步数（1-100）"
      default: 5
      minimum: 1
      maximum: 100
    guidance_scale:
      type: "number"
      description: "提示词引导强度（0-20）"
      default: 7.5
      minimum: 0
      maximum: 20
    cfg:
      type: "number"
      description: "分类器自由引导尺度（0-20）"
      default: 10.05
      minimum: 0
      maximum: 20
    image:
      type: "string"
      description: "第一张参考图片URL（用于图生图）"
    image2:
      type: "string"
      description: "第二张参考图片URL"
    image3:
      type: "string"
      description: "第三张参考图片URL"
  required:
    - prompt
---

# SiliconFlow Image Generator - 图像生成工具

## 1. 核心功能概述

本技能是一个**工具Skill**，专门用于调用SiliconFlow的图像生成API，根据用户的文本描述或参考图片生成高质量图像。

**主要用途**：
- 根据文本提示词生成全新图像（文生图）
- 基于参考图片和提示词转换图像风格（图生图）
- 批量生成多张图像用于对比和选择
- 精确控制图像生成的参数（尺寸、风格、质量等）

**不适用于**：
- 图像编辑（如裁剪、滤镜、拼接）
- 识别图像内容
- 处理视频文件
- 修改已有图像的特定区域

## 2. 使用示例

**场景1：基础文生图**
- **用户请求**："帮我生成一张海边日落的图片"
- **AI响应**：
  ```xml
  <tool_action name="siliconflow-image-generator">
    <prompt value="a beautiful sunset over the ocean, golden hour lighting, peaceful waves, photorealistic" />
  </tool_action>
  ```
- **期望输出**：
  ```json
  {
    "images": [
      {
        "url": "https://s3.siliconflow.cn/default/outputs/..."
      }
    ],
    "seed": 123456789
  }
  ```

**场景2：批量生成不同风格**
- **用户请求**："画一个未来城市，我要4张不同风格的"
- **AI响应**：
  ```xml
  <tool_action name="siliconflow-image-generator">
    <prompt value="futuristic cyberpunk city, neon lights, flying cars, skyscrapers" />
    <batch_size value="4" />
    <image_size value="1024x1024" />
    <guidance_scale value="9.0" />
  </tool_action>
  ```

**场景3：图生图转换**
- **用户请求**："把这张照片转换成动漫风格"
- **AI响应**：
  ```xml
  <tool_action name="siliconflow-image-generator">
    <prompt value="transform into anime style, vibrant colors, detailed illustration" />
    <image value="https://example.com/photo.jpg" />
    <negative_prompt value="blurry, low quality, distorted" />
  </tool_action>
  ```

**场景4：产品设计图**
- **用户请求**："设计一个现代简约的咖啡杯，产品渲染图"
- **AI响应**：
  ```xml
  <tool_action name="siliconflow-image-generator">
    <prompt value="modern minimalist coffee cup, white ceramic, studio lighting, product photography, commercial style, clean background" />
    <image_size value="1024x1024" />
    <guidance_scale value="10.0" />
  </tool_action>
  ```

## 3. 操作指南与工作流程

当AI决定调用此Skill后，应执行：

1. **步骤一：解析用户需求**
   - 识别用户是否要求生成图片、绘图或图像
   - 提取核心描述词：主题、风格、场景等
   - 判断是否需要批量生成（用户是否提到"多张"、"几张"）

2. **步骤二：构造提示词**
   - 将用户的自然语言转换为详细的英文提示词
   - 添加风格关键词：photorealistic、digital art、oil painting等
   - 加入质量提升词：high quality、detailed、4K等
   - 如有负面提示，提取不想要的元素

3. **步骤三：确定生成参数**
   - 模型已固定为"Kwai-Kolors/Kolors"，无需指定
   - 设置图像尺寸：默认512x512，快速预览可用小尺寸，高质量用1024x1024
   - 确定批量大小：1张（默认）至4张
   - 调整引导强度：根据需求设置5-12之间的值

4. **步骤四：执行生成调用**
   - 调用siliconflow-image-generator工具
   - 传入所有构造好的参数
   - 等待API响应并处理结果

5. **步骤五：格式化输出**
   - 提取返回的图像URL
   - 向用户展示生成的图片链接
   - **使用Markdown格式渲染图片**：`![描述](图片URL)`
     - 例如：`![生成的海边日落](https://s3.siliconflow.cn/default/outputs/...)`
   - 说明使用的参数（如批量大小、seed等）

## 4. 技能内部资源说明

- `execute.js`: 主执行脚本，处理API调用和参数验证
- `package.json`: 依赖管理和脚本配置
- `SKILL.md`: 详细使用文档和示例

## 5. 边界说明与注意事项

**输入限制**：
- 提示词长度：建议不超过500字符，过长可能被截断
- 批量大小：1-4张，超过4张会被限制为4张
- 图像尺寸：标准尺寸如"512x512"、"1024x1024"，非标准尺寸可能失败
- 参考图片：必须是可访问的HTTPS URL

**不适用于**：
- 图像修复、放大或超分辨率处理
- 生成SVG、矢量图等非位图格式
- 创建动画或GIF
- 批量处理大量图片（建议分批进行）

**前置条件**：
- 需要稳定的网络连接访问SiliconFlow API
- 用户请求中应包含明确的图像生成意图

**异常处理**：
- 如果API调用失败，返回："抱歉，图像生成服务暂时不可用，请稍后重试"
- 如果提示词无效，返回："无法理解您的图像描述，请尝试更具体的描述"
- 如果批量生成超时，建议减少批量大小后重试
- 如果参考图片无法访问，返回："参考图片无法访问，请检查图片URL是否正确"
- 如果异步任务超时，返回："图像生成任务超时，请稍后重试"

## 6. 参数说明

### 核心参数

**prompt**（提示词）：
- 必填参数
- 描述越详细，生成效果越好
- 建议包含：主体、风格、构图、光线、色彩

**固定模型**：
- 模型：Kwai-Kolors/Kolors（无需指定，系统自动使用）

**batch_size**（批量大小）：
- 默认：1
- 范围：1-4
- 建议：质量优先选1-2张，速度优先可选择4张

**image_size**（图像尺寸）：
- 默认：512x512（快速）
- 推荐：1024x1024（高质量）
- 其他：768x768、1024x768等

### 可选参数

**negative_prompt**（负面提示）：
- 用于避免不想要的元素
- 常用词：blurry、low quality、distorted、deformed

**guidance_scale**（引导强度）：
- 默认：7.5
- 范围：0-20
- 低值（5-7）：更自由、创意
- 高值（8-12）：更贴近提示词

**seed**（随机种子）：
- 默认：-1（随机）
- 固定数值：获得可重复结果
- 用途：调试、对比不同参数效果

## 7. 最佳实践

**编写高质量提示词**：
- 具体描述而非抽象概念
- 包含风格关键词
- 指定光线、构图、色彩
- 使用艺术风格词汇

**选择合适参数**：
- 快速预览：512x512，步数20，引导强度7.5
- 高质量输出：1024x1024，步数30-50，引导强度8-10
- 风格变化：固定seed，多次生成对比

**图生图技巧**：
- 参考图片质量要高
- 提示词描述期望的变化
- 适当使用负面提示避免瑕疵

**异步任务处理**：
- 系统支持同步和异步两种模式
- 同步模式：立即返回结果（< 1秒）
- 异步模式：自动轮询任务状态，最多等待2分钟
- 轮询间隔：2秒，最多重试60次
- 如遇超时，建议稍后重试或减少批量大小

---

**一句话记住**：这个工具就是让AI能够**快速理解用户要生成什么图片、准确调用SiliconFlow API、正确执行图像生成任务**的工作手册。
