const crypto = require("crypto");
const required = (param) => {throw (`Missing param: ${param}`)};

const isObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]';
const isArray = Array.isArray;

class AlbPatch {
    constructor(serverless, options = {}) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');
        this.hooks = {
            "before:package:finalize": this.init.bind(this),
        }
    }

    generateMd5Hash(val) {
        return crypto.createHash('md5').update(val).digest("hex");
    }

    findTargetGroups(functionName = required`functionName`, stack = required`stack`) {
        const targetGroupKeys = Object.keys(stack.Resources)
            .filter(resourceKey => stack.Resources[resourceKey].Type === "AWS::ElasticLoadBalancingV2::TargetGroup");
        return targetGroupKeys.reduce((result, resourceKey) => {
            if (resourceKey.substr(0, functionName.length) !== functionName) return result;
            return Object.assign(result, {[`${resourceKey}`]: stack.Resources[resourceKey]})
        }, {});
    }

    hasTargetGroupRef(name, obj) {
        if (isArray(obj)) {
            obj.forEach(item => {
                if (isArray(item) || isObject(item)) return this.hasTargetGroupRef(target, item);
                else if (item === name) return true
            });
            return false;
        }
        for (const key in obj) {
            if (obj.hasOwnProperty(key) === false) continue;
            if (isObject(obj[key]) || isArray(obj[key])) return this.hasTargetGroupRef(name, obj[key]);
            else if (obj[key] === name) return true;
            if (key === name) return true;
        }
        return false;
    }

    findMissingPermissions(functionName = required`functionName`, stack = required`stack`, targetGroups = required`targetGroups`) {
        const permissionResourceKeys = Object.keys(stack.Resources)
            .filter(resourceKey => stack.Resources[resourceKey].Type === "AWS::Lambda::Permission");
        if (permissionResourceKeys.length === 0) return;
        const resourceKeys = permissionResourceKeys.filter(permissionResourceKey =>
            stack.Resources[permissionResourceKey].Properties.Principal === "elasticloadbalancing.amazonaws.com");
        const permissions = resourceKeys.reduce((result, resourceKey) =>
            Object.assign(result, {[`${resourceKey}`]: stack.Resources[resourceKey]}), {});

        const response = {};
        for (const targetGroupKey in targetGroups) {
            if (targetGroups.hasOwnProperty(targetGroupKey) === false) continue;
            if (this.hasTargetGroupRef(targetGroupKey, permissions)) continue;
            response[`${functionName}LambdaPermissionAlb${this.generateMd5Hash(targetGroupKey)}`] = {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                    "FunctionName": {
                        "Fn::GetAtt": [
                            `${functionName}LambdaFunction`,
                            "Arn"
                        ]
                    },
                    "Action": "lambda:InvokeFunction",
                    "Principal": "elasticloadbalancing.amazonaws.com",
                    "SourceArn": {
                        "Ref": targetGroupKey
                    }
                }
            }
        }
        return response;
    }

    init() {
        const stageStack = this.serverless.service.provider.compiledCloudFormationTemplate;
        for (const functionName in this.serverless.service.functions) {
            if (this.serverless.service.functions.hasOwnProperty(functionName) === false) continue;
            const normalizedFunctionName = this.provider.naming.getNormalizedFunctionName(functionName);
            const targetGroups = this.findTargetGroups(normalizedFunctionName, stageStack);
            const permissions = this.findMissingPermissions(normalizedFunctionName, stageStack, targetGroups);
            Object.assign(stageStack.Resources, permissions);
        }
    }
}

module.exports = AlbPatch;