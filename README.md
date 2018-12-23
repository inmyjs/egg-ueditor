# egg-ueditor
基于egg的UEditor百度编辑器后端实现，支持图片/文件上传、列表及图片远程抓取

### 安装

```
 npm install egg-ueditor --save
```

### 使用方法


1. 在app/router.js中如下使用
```javascript

const ueditor = require('egg-ueditor')

app.all('/ueditor', ueditor())
```
   注意：默认上传至egg静态资源目录app/public，若需要上传至其他目录，如下使用：
```javascript
app.all('/ueditor', ueditor(['assets/public','public']))
```
   参数为一个数组，第1个参数为静态资源相对目录，第2个参数为静态资源url映射路径。
   
   返回的图片/文件url为完整http地址，以方便前后端分布部署，比如:http://127.0.0.1:7001/public/upload/ueditor/image/20181223/1545560529310279850.png
     
2. 可以修改 UEditor 配置，具体的参数请参考 UEditor 官方的文档
```javascript
// 需要传UEditor 配置对象
router.all('/ueditor', ueditor({
	"imageAllowFiles": [".png", ".jpg", ".jpeg"]
	"imagePathFormat": "/upload/ueditor/image/{yyyy}{mm}{dd}/{filename}"  // 保存为原文件名
}))
```
  或者
```javascript
// 需要传UEditor 配置对象
router.all('/ueditor', ueditor(['app/public','public']，{
	"imageAllowFiles": [".png", ".jpg", ".jpeg"]
	"imagePathFormat": "/upload/ueditor/image/{yyyy}{mm}{dd}/{filename}"  // 保存为原文件名
}))
```