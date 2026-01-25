# 创建视频，带图片  sora-2

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/video/create:
    post:
      summary: 创建视频，带图片  sora-2
      deprecated: false
      description: ''
      tags:
        - 视频模型/sora 视频生成/统一视频格式
      parameters:
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
        - name: Accept
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                images:
                  type: array
                  items:
                    type: string
                  description: 图片链接
                model:
                  type: string
                  description: 模型名字
                orientation:
                  type: string
                  description: |
                    portrait 竖屏
                    landscape 横屏
                prompt:
                  type: string
                  description: 提示词
                size:
                  type: string
                  description: ' small 一般720p'
                duration:
                  type: integer
                  description: '枚举值: 10'
                watermark:
                  type: string
                  description: |
                    默认为： true  会优先无水印，如果出错，会兜底到有水印
                    传递 false 的话 会强制让视频无水印，遇到去水印错误的会一直自动重试
              required:
                - images
                - model
                - orientation
                - prompt
                - size
                - duration
                - watermark
              x-apifox-orders:
                - images
                - model
                - orientation
                - prompt
                - size
                - duration
                - watermark
            example:
              images:
                - >-
                  https://filesystem.site/cdn/20250612/998IGmUiM2koBGZM3UnZeImbPBNIUL.png
              model: sora-2-all
              orientation: portrait
              prompt: make animate
              size: large
              duration: 15
              watermark: false
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  status:
                    type: string
                  status_update_time:
                    type: integer
                required:
                  - id
                  - status
                  - status_update_time
                x-apifox-orders:
                  - id
                  - status
                  - status_update_time
              example:
                id: sora-2:task_01k6x15vhrff09dkkqjrzwhm60
                status: pending
                status_update_time: 1759763427208
          headers: {}
          x-apifox-name: 成功
      security:
        - bearer: []
      x-apifox-folder: 视频模型/sora 视频生成/统一视频格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7109750/apis/api-360310240-run
components:
  schemas: {}
  securitySchemes:
    bearer:
      type: http
      scheme: bearer
servers:
  - url: https://api.vectorengine.ai
    description: 正式环境
security:
  - bearer: []

```


# 查询任务 

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/video/query:
    get:
      summary: '查询任务 '
      deprecated: false
      description: |+
        给定一个提示，该模型将返回一个或多个预测的完成，并且还可以返回每个位置的替代标记的概率。

        为提供的提示和参数创建完成

      tags:
        - 视频模型/sora 视频生成/统一视频格式
      parameters:
        - name: id
          in: query
          description: |
            任务ID
          required: true
          example: sora-2:task_01kbfq03gpe0wr9ge11z09xqrj
          schema:
            type: string
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
        - name: Accept
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
        - name: X-Forwarded-Host
          in: header
          description: ''
          required: false
          example: localhost:5173
          schema:
            type: string
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties: {}
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  status:
                    type: string
                  video_url:
                    type: 'null'
                  enhanced_prompt:
                    type: string
                  status_update_time:
                    type: integer
                required:
                  - id
                  - status
                  - video_url
                  - enhanced_prompt
                  - status_update_time
                x-apifox-orders:
                  - id
                  - status
                  - video_url
                  - enhanced_prompt
                  - status_update_time
              examples:
                '1':
                  summary: pending
                  value:
                    id: sora-2:task_01k6x15vhrff09dkkqjrzwhm60
                    detail:
                      id: task_01k6x15vhrff09dkkqjrzwhm60
                      input:
                        size: small
                        model: sy_ore
                        images:
                          - >-
                            https://filesystem.site/cdn/20250612/VfgB5ubjInVt8sG6rzMppxnu7gEfde.png
                          - >-
                            https://filesystem.site/cdn/20250612/998IGmUiM2koBGZM3UnZeImbPBNIUL.png
                        prompt: make animate
                        orientation: portrait
                      status: pending
                      pending_info:
                        id: task_01k6x15vhrff09dkkqjrzwhm60
                        seed: null
                        type: video_gen
                        user: user-a1sGDUIOXV32hNITe59LEkHa
                        model: sy_8
                        title: New Video
                        width: 352
                        height: 640
                        prompt: make animate
                        sdedit: null
                        status: processing
                        actions: null
                        guidance: null
                        n_frames: 450
                        priority: 2
                        operation: simple_compose
                        preset_id: null
                        created_at: '2025-10-06T15:10:26.875729Z'
                        n_variants: 1
                        project_id: null
                        request_id: null
                        generations: []
                        tracking_id: null
                        progress_pct: 0.9302178175176704
                        remix_config: null
                        inpaint_items:
                          - type: image
                            preset_id: null
                            crop_bounds: null
                            frame_index: 0
                            cameo_file_id: null
                            generation_id: null
                            upload_media_id: media_01k6x15tnzezbst05sth2qgd8r
                            source_end_frame: 0
                            uploaded_file_id: null
                            source_start_frame: 0
                          - type: image
                            preset_id: null
                            crop_bounds: null
                            frame_index: 0
                            cameo_file_id: null
                            generation_id: null
                            upload_media_id: media_01k6x15tzafwztz74t018v3enw
                            source_end_frame: 0
                            uploaded_file_id: null
                            source_start_frame: 0
                        interpolation: null
                        is_storyboard: null
                        failure_reason: null
                        organization_id: null
                        moderation_result:
                          code: null
                          type: passed
                          task_id: task_01k6x15vhrff09dkkqjrzwhm60
                          is_output_rejection: false
                          results_by_frame_index: {}
                        needs_user_review: false
                        queue_status_message: null
                        progress_pos_in_queue: null
                        num_unsafe_generations: 0
                        estimated_queue_wait_time: null
                    status: pending
                    status_update_time: 1759763621142
                '2':
                  summary: completed
                  value:
                    id: sora-2:task_01k6x15vhrff09dkkqjrzwhm60
                    width: 352
                    detail:
                      id: task_01k6x15vhrff09dkkqjrzwhm60
                      url: >-
                        https://filesystem.site/gptimage/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                      input:
                        size: small
                        model: sy_ore
                        images:
                          - >-
                            https://filesystem.site/cdn/20250612/VfgB5ubjInVt8sG6rzMppxnu7gEfde.png
                          - >-
                            https://filesystem.site/cdn/20250612/998IGmUiM2koBGZM3UnZeImbPBNIUL.png
                        prompt: make animate
                        orientation: portrait
                      status: completed
                      gif_url: >-
                        https://filesystem.site/gptimage/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fpreview.gif?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=EoeGtZEdRHRRF6Y6KghYOngvj9NaocLD5Jh23OAeZXc%3D&az=oaivgprodscus
                      draft_info:
                        id: gen_01k6x1bffaf3dr786harh8maqt
                        url: >-
                          https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                        kind: sora_draft
                        tags: []
                        title: null
                        width: 352
                        height: 640
                        prompt: make animate
                        task_id: task_01k6x15vhrff09dkkqjrzwhm60
                        encodings:
                          md:
                            path: >-
                              https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fmd.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=sk0XqtY55jqLECnAx9L9O%2BP4fpFmKisIGwQ2rFGJVLU%3D&az=oaivgprodscus
                          gif:
                            path: >-
                              https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fpreview.gif?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=EoeGtZEdRHRRF6Y6KghYOngvj9NaocLD5Jh23OAeZXc%3D&az=oaivgprodscus
                          source:
                            path: >-
                              https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                          unfurl: null
                          source_wm:
                            path: >-
                              https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                          thumbnail:
                            path: >-
                              https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fthumbnail.webp?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=ovYpytJMOZjyqD4vIf%2B66V5YqGGopu7AQM9n5ef421I%3D&az=oaivgprodscus
                        created_at: 1759763631.222531
                        generation_id: gen_01k6x1bffaf3dr786harh8maqt
                        draft_reviewed: false
                        creation_config:
                          prompt: make animate
                          task_id: null
                          n_frames: null
                          style_id: null
                          orientation: null
                          inpaint_image: null
                          cameo_profiles: null
                          remix_target_post: null
                        generation_type: ''
                        downloadable_url: >-
                          https://videos.openai.com/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                      thumbnail_url: >-
                        https://filesystem.site/gptimage/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fthumbnail.webp?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=ovYpytJMOZjyqD4vIf%2B66V5YqGGopu7AQM9n5ef421I%3D&az=oaivgprodscus
                    height: 640
                    status: completed
                    video_url: >-
                      https://filesystem.site/gptimage/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fsrc.mp4?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=log0LI%2Bwadi1bnm9MOw4UAptQC9Bi%2F8fPcpSVeRBq7I%3D&az=oaivgprodscus
                    thumbnail_url: >-
                      https://filesystem.site/gptimage/vg-assets/assets%2Ftask_01k6x15vhrff09dkkqjrzwhm60%2Ftask_01k6x15vhrff09dkkqjrzwhm60_genid_6d46f487-b05f-4854-9c0f-4f2169caab0d_25_10_06_15_13_166244%2Fvideos%2F00000_wm%2Fthumbnail.webp?st=2025-10-06T14%3A04%3A21Z&se=2025-10-12T15%3A04%3A21Z&sks=b&skt=2025-10-06T14%3A04%3A21Z&ske=2025-10-12T15%3A04%3A21Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=8ebb0df1-a278-4e2e-9c20-f2d373479b3a&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=ovYpytJMOZjyqD4vIf%2B66V5YqGGopu7AQM9n5ef421I%3D&az=oaivgprodscus
                    status_update_time: 1759763651908
          headers: {}
          x-apifox-name: 成功
      security:
        - bearer: []
      x-apifox-folder: 视频模型/sora 视频生成/统一视频格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7109750/apis/api-386534724-run
components:
  schemas: {}
  securitySchemes:
    bearer:
      type: http
      scheme: bearer
servers:
  - url: https://api.vectorengine.ai
    description: 正式环境
security:
  - bearer: []

```


# 创建角色

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /sora/v1/characters:
    post:
      summary: 创建角色
      deprecated: false
      description: ''
      tags:
        - 视频模型/sora 视频生成
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                url:
                  type: string
                  description: |
                    视频中包含需要创建的角色 ,url 和from_task 二选一 
                timestamps:
                  type: string
                  description: |
                    单位秒，例如 ‘1,2’ 是指视频的1～2秒中出现的角色，注意范围差值最大 3 秒最小 1 秒
                from_task:
                  type: string
                  description: |
                    可以根据已经生成的任务 id，来创建角色
              required:
                - timestamps
              x-apifox-orders:
                - url
                - timestamps
                - from_task
            example: "{\r\n  // \"url\": \"https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4\",\r\n    \"timestamps\": \"1,3\",\r\n    \"from_task\":\"video_e50c76ca-21d4-40e9-8485-e4ead2d37133\"\r\n}"
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: 角色id
                  username:
                    type: string
                    description: 角色名称，用于放在提示词中 @{username}
                  permalink:
                    type: string
                    description: 角色主页，跳转到 openai 角色主页
                  profile_picture_url:
                    type: string
                    description: 角色头像
                required:
                  - id
                  - username
                  - permalink
                  - profile_picture_url
                x-apifox-orders:
                  - id
                  - username
                  - permalink
                  - profile_picture_url
              example:
                id: ch_6918d62178e48191a0b1ae49be428a13
                username: hfspncadz.mooflapand
                permalink: https://sora.chatgpt.com/profile/hfspncadz.mooflapand
                profile_picture_url: >-
                  https://videos.openai.com/az/files/00000000-b788-71f7-9de5-96555ff29024%2Fraw?se=2025-11-20T00%3A00%3A00Z&sp=r&sv=2024-08-04&sr=b&skoid=1af02b11-169c-463d-b441-d2ccfc9f02c8&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2025-11-15T01%3A48%3A34Z&ske=2025-11-22T01%3A53%3A34Z&sks=b&skv=2024-08-04&sig=3/KGVtkEsZWBTmErhzUEU5pWrnL8JxRKH0wVCQvh6Fo%3D&ac=oaisdmntprsouthcentralus
          headers: {}
          x-apifox-name: 成功
      security:
        - bearer: []
      x-apifox-folder: 视频模型/sora 视频生成
      x-apifox-status: developing
      x-run-in-apifox: https://app.apifox.com/web/project/7109750/apis/api-381740613-run
components:
  schemas: {}
  securitySchemes:
    bearer:
      type: http
      scheme: bearer
servers:
  - url: https://api.vectorengine.ai
    description: 正式环境
security:
  - bearer: []

```

