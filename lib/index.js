/**
 * by inmyjs
 * @type
 */
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const upload = require('./upload')
const config = require('./config')

// 同步遍历文件
function eachFileSync(dir, findOneFile){
    const stats = fs.statSync(dir)
    if(stats.isDirectory()){
        fs.readdirSync(dir).forEach(file => {
            eachFileSync(path.join(dir, file), findOneFile)
        })
    }else{
        findOneFile(dir, stats)
    }
}

// 处理Ueditor上传保存路径
function setFullPath(dest) {
    const date = new Date()

    const map = {
        't': date.getTime(), // 时间戳
        'm': date.getMonth() + 1, // 月份
        'd': date.getDate(), // 日
        'h': date.getHours(), // 时
        'i': date.getMinutes(), // 分
        's': date.getSeconds(), // 秒
    };

    dest = dest.replace(/\{([ymdhis])+\}|\{time\}|\{rand:(\d+)\}/g, function(all, t, r){
        let v = map[t];
        if(v !== undefined){
            if(all.length > 1){
                v = '0' + v
                v = v.substr(v.length-2)
            }
            return v;
        }else if(t === 'y'){
            return (date.getFullYear() + '').substr(6 - all.length);
        }else if(all === '{time}'){
            return map['t']
        }else if(r >= 0){
            return Math.random().toString().substr(2, r)
        }
        return all
    });

    return dest
}

// 抓取网络图片
const catchImage = function(url) {
    const request = /^https:\/\//.test(url) ? https.request : http.request
    let image = url.match(/^(:?https?\:)?\/\/[^#?]+/)[0]
    let originalname = image.substr(image.lastIndexOf('\/') + 1)
    let contentType = ''
    let base64Data = ''
    return new Promise((resolve, reject) => {
        const req = request(url, (res) => {
            contentType = res.headers['content-type']
            res.setEncoding('base64')
            res.on('data', (chunk) => {
                base64Data += chunk
            })
            res.on('end', () => resolve({contentType, base64Data, originalname}))
        })

        req.on('error', (err) => resolve({error: true}))
        req.end()
    })
}

/**
 * ueditor上传方法
 * @param  {string/array} dir    静态目录，若是数组[dir, urlPath]第2个为映射路径
 * @param  {object} options      upload方法参数
 * @return {function}            Ueditor Controller
 */
const ueditor = function(dir, options) {
    let ueOpts = []
    if(typeof dir === 'object'){
        if(Array.isArray(dir)){
            ueOpts = dir
        }else{
            options = dir
            ueOpts.push(dir || 'app/public')
            ueOpts.push('public')
        }
    }else{
        ueOpts.push(dir || 'app/public')
        ueOpts.push('public')
    }

    const publicDir = path.resolve(ueOpts[0])
    const publicUrlDir = ueOpts[1]
    const conf = Object.assign({}, config, options || {})
    const uploadType = {
        [conf.imageActionName]: 'image',
        [conf.scrawlActionName]: 'scrawl',
        [conf.catcherActionName]: 'catcher',
        [conf.videoActionName]: 'video',
        [conf.fileActionName]: 'file',
    }
    const listType = {
        [conf.imageManagerActionName]: 'image',
        [conf.fileManagerActionName]: 'file',
    }

    // Ueditor Controller
    return async (ctx, next) => {
        let result = {}
        let {action, start = 0} = ctx.query
        start = parseInt(start)

        let resInfo={}
        // 上传文件
        if(Object.keys(uploadType).includes(action)){
            const actionName = uploadType[action]
            let pathFormat = setFullPath(conf[actionName + 'PathFormat']).split('/')
            let filename = pathFormat.pop()
            try {
                switch (action) {
                    // 涂鸦类型图片
                    case conf.scrawlActionName:
                        let base64Data = ctx.request.body[conf[actionName + 'FieldName']]
                        let base64Length = base64Data.length
                        if(base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']){
                            throw new Error('Picture too big')
                        }
                        ctx.req.file = upload.base64Image(base64Data, publicDir, {
                            destination: path.join(publicDir, ...pathFormat)
                        })

                        resInfo=upload.fileFormat(ctx.req.file)
                        resInfo.url=ctx.protocol+'://'+ctx.host+'/'+publicUrlDir+resInfo.url;
                        result = Object.assign({state: 'SUCCESS'}, resInfo)
                        break;
                    // 抓取远程图片
                    case conf.catcherActionName:
                        const sources = ctx.request.body[conf[actionName + 'FieldName']]
                        let list = []
                        let images = []
                        sources.forEach((url) => {
                            images.push(catchImage(url).then((image) => {
                                if(image.error){
                                    list.push({state: 'ERROR', source: url})
                                }else{
                                    let base64Data = image.base64Data
                                    let base64Length = base64Data.length
                                    if(base64Length - (base64Length / 8) * 2 > conf[actionName + 'MaxSize']){
                                        list.push({state: 'Picture too big', source: url})
                                    }else{
                                        // 重新获取filename
                                        filename = setFullPath(conf[actionName + 'PathFormat']).split('/').pop()
                                        if(filename === '{filename}'){
                                            filename = image.originalname.replace(/\.\w+$/, '')
                                        }
                                        if(/^image\/(\w+)$/.test(image.contentType)){
                                            base64Data = 'data:'+ image.contentType +';base64,' + base64Data
                                        }
                                        resInfo=upload.fileFormat(
                                            upload.base64Image(base64Data, publicDir, {
                                                destination: path.join(publicDir, ...pathFormat),
                                                filename
                                            })
                                        )
                                        resInfo.url=ctx.protocol+'://'+ctx.host+'/'+publicUrlDir+resInfo.url;
                                        list.push(Object.assign({state: 'SUCCESS', source: url},resInfo , {original: image.originalname}))
                                    }
                                }
                                return image
                            }))
                        })

                        await Promise.all(images)
                        result = {state: 'SUCCESS', list}
                        break;
                    // 表单上传图片、文件
                    default:
                        await upload(publicDir, {
                            storage: upload.diskStorage({
                                destination: path.join(publicDir, ...pathFormat),
                                filename (req, file, cb) {
                                    if(filename === '{filename}'){
                                        filename = file.originalname
                                    }else{
                                        filename += upload.getSuffix(file.originalname)
                                    }
                                    cb(null, filename)
                                }
                            }),
                            limits: {
                                fileSize: conf[actionName + 'MaxSize']
                            },
                            allowfiles: conf[actionName + 'AllowFiles']
                        }, options || {}).single(conf[actionName + 'FieldName'])(ctx, next)
                        resInfo=upload.fileFormat(ctx.req.file)
                        resInfo.url=ctx.protocol+'://'+ctx.host+'/'+publicUrlDir+resInfo.url;
                        result = Object.assign({state: 'SUCCESS'}, resInfo)
                }
            } catch (err) {
                result = {state: err.message}
            }
        }
        // 获取图片/文件列表
        else if(Object.keys(listType).includes(action)){
            const actionName = listType[action]
            let files = []
            eachFileSync(path.join(publicDir, conf[actionName + 'ManagerListPath']), (file, stat) => {
                if(conf[actionName + 'ManagerAllowFiles'].includes(upload.getSuffix(file))){
                    const url = file.replace(publicDir, '').replace(/\\/g, '\/')
                    const mtime = stat.mtimeMs
                    files.push({url, mtime})
                }
            })
            result = {
                list: files.slice(start, start + conf[actionName + 'ManagerListSize']),
                start: start,
                total: files.length,
                state: 'SUCCESS'
            }
        }
        // 返回Ueditor配置给前端
        else if(action === 'config'){
            result = conf
        }
        else{
            result = {state: 'FAIL'}
        }

        ctx.body = JSON.stringify(result)
    }
}

exports = module.exports = ueditor
exports.eachFileSync = eachFileSync
exports.setFullPath = setFullPath
