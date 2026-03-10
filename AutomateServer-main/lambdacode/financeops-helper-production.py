import boto3
import json
import urllib.request

def send_response(event, status, data={}):
    body = json.dumps({
        'Status': status,
        'Reason': 'See CloudWatch logs',
        'PhysicalResourceId': event.get('PhysicalResourceId', 'helper-resource'),
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data
    }).encode('utf-8')
    req = urllib.request.Request(
        url=event['ResponseURL'],
        data=body,
        method='PUT'
    )
    req.add_header('Content-Type', '')
    req.add_header('Content-Length', len(body))
    urllib.request.urlopen(req)

def handler(event, context):
    print("Event:", json.dumps(event))
    client = boto3.client('lambda')
    props  = event.get('ResourceProperties', {})
    fn_arn = props.get('FunctionArn')
    sid    = props.get('StatementId')
    src    = props.get('SourceArn')

    try:
        if event['RequestType'] in ('Create', 'Update'):
            # Remove old permission if exists to avoid conflict
            try:
                client.remove_permission(
                    FunctionName=fn_arn,
                    StatementId=sid
                )
                print(f"Removed existing permission: {sid}")
            except client.exceptions.ResourceNotFoundException:
                pass
            except Exception as e:
                print(f"Remove warning: {e}")

            # Add the permission via SDK
            client.add_permission(
                FunctionName=fn_arn,
                StatementId=sid,
                Action='lambda:InvokeFunction',
                Principal='apigateway.amazonaws.com',
                SourceArn=src
            )
            print(f"Permission added successfully: {sid}")
            send_response(event, 'SUCCESS', {'Message': 'Permission added'})

        elif event['RequestType'] == 'Delete':
            try:
                client.remove_permission(
                    FunctionName=fn_arn,
                    StatementId=sid
                )
                print(f"Permission removed: {sid}")
            except Exception as e:
                print(f"Delete warning (ok): {e}")
            send_response(event, 'SUCCESS', {'Message': 'Permission removed'})

    except Exception as e:
        print(f"FAILED: {e}")
        send_response(event, 'FAILED')
