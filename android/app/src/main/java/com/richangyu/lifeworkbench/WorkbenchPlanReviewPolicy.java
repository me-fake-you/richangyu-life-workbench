package com.richangyu.lifeworkbench;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Local display/review guards only. Server signature, conflict and atomic write checks remain authoritative. */
final class WorkbenchPlanReviewPolicy {
    static final int MAX_REFERENCES=8;
    static final long REFERENCE_TTL=5*60000L;
    static final class Operation {
        final String action,id,title,beforeId;
        final Long start,end,beforeStart,beforeEnd;
        final boolean afterTimeZoned;
        Operation(String action,String id,String title,String start,String end,
                  String beforeId,String beforeStart,String beforeEnd){
            this.action=action;this.id=id;this.title=title;this.beforeId=beforeId==null?"":beforeId;
            this.start=WorkbenchSchedulePolicy.instant(start);this.end=WorkbenchSchedulePolicy.instant(end);
            this.afterTimeZoned=explicitTime(start)&&explicitTime(end);
            this.beforeStart=WorkbenchSchedulePolicy.instant(beforeStart);this.beforeEnd=WorkbenchSchedulePolicy.instant(beforeEnd);
        }
    }
    private static boolean explicitTime(String raw){
        return raw!=null&&raw.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,3})?)?(?:Z|\\+08:00)");
    }
    static boolean safeId(String id){return id!=null&&id.matches("[A-Za-z0-9_-]{1,79}");}
    static boolean scopeMatches(String expected,String actual){
        return expected!=null&&expected.matches("[0-9a-f]{64}")&&expected.equals(actual);
    }
    static boolean contextFresh(long readElapsed,long nowElapsed){
        return readElapsed>0&&nowElapsed>=readElapsed&&nowElapsed-readElapsed<=REFERENCE_TTL;
    }
    static Set<String> unambiguousIds(List<String> ids){
        Set<String> seen=new LinkedHashSet<>(),duplicates=new HashSet<>();
        for(String id:ids)if(safeId(id)&&!seen.add(id))duplicates.add(id);
        seen.removeAll(duplicates);return seen;
    }
    static boolean selectionValid(List<String> selected,Set<String> available){
        if(selected==null||available==null||selected.size()>MAX_REFERENCES)return false;
        Set<String> seen=new HashSet<>();
        for(String id:selected)if(!safeId(id)||!available.contains(id)||!seen.add(id))return false;
        return true;
    }
    static List<String> problems(List<Operation> operations,Set<String> selected,Set<String> editable,long now){
        List<String> problems=new ArrayList<>();
        if(operations==null||operations.isEmpty()||operations.size()>8){
            problems.add("\u8349\u7a3f\u5fc5\u987b\u5305\u542b 1 \u81f3 8 \u9879\u53ef\u6838\u5bf9\u7684\u5b89\u6392\u3002");return problems;
        }
        Set<String> ids=new HashSet<>();
        for(Operation item:operations){
            if(item==null||!safeId(item.id)||item.title==null||item.title.trim().isEmpty()){
                problems.add("\u6709\u6761\u76ee\u7f3a\u5c11\u6709\u6548\u6807\u8bc6\u6216\u6807\u9898\u3002");continue;
            }
            if(!ids.add(item.id))problems.add("\u540c\u4e00\u65e5\u7a0b\u51fa\u73b0\u91cd\u590d\u64cd\u4f5c\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002");
            if(!"create".equals(item.action)&&!"update".equals(item.action)){
                problems.add("\u542b\u4e0d\u652f\u6301\u7684\u64cd\u4f5c\uff0c\u4e0d\u5141\u8bb8\u5220\u9664\u6216\u76f4\u63a5\u6267\u884c\u3002");continue;
            }
            if(!item.afterTimeZoned||item.start==null||item.end==null||item.end<=item.start||item.start<now-60000L
                ||item.end-item.start>12*3600000L)problems.add("\u6709\u65f6\u95f4\u7f3a\u5931\u3001\u5df2\u5f00\u59cb\u6216\u8fc7\u957f\u7684\u5b89\u6392\u3002");
            if("create".equals(item.action)&&!item.beforeId.isEmpty())problems.add("\u65b0\u589e\u6761\u76ee\u4e0d\u80fd\u4f2a\u88c5\u6210\u5df2\u6709\u65e5\u7a0b\u3002");
            if("update".equals(item.action)){
                if(selected==null||editable==null||!selected.contains(item.id)||!editable.contains(item.id)
                    ||!item.id.equals(item.beforeId))problems.add("\u4fee\u6539\u76ee\u6807\u4e0d\u662f\u672c\u6b21\u4e3b\u52a8\u9009\u4e2d\u4e14\u53ef\u8c03\u6574\u7684\u65e5\u7a0b\u3002");
                if(item.beforeStart==null||item.beforeEnd==null||item.beforeEnd<=item.beforeStart||item.beforeStart<=now)
                    problems.add("\u4fee\u6539\u524d\u7684\u65e5\u671f\u65f6\u95f4\u65e0\u6cd5\u6838\u5bf9\u6216\u539f\u65e5\u7a0b\u5df2\u7ecf\u5f00\u59cb\u3002");
            }
        }
        for(int i=0;i<operations.size();i++)for(int j=i+1;j<operations.size();j++){
            Operation a=operations.get(i),b=operations.get(j);
            if(a!=null&&b!=null&&a.start!=null&&a.end!=null&&b.start!=null&&b.end!=null
                &&a.start<b.end&&b.start<a.end)problems.add("\u8349\u7a3f\u5185\u6709\u65f6\u95f4\u91cd\u53e0\uff0c\u8bf7\u4fee\u6539\u8981\u6c42\u540e\u91cd\u65b0\u751f\u6210\u3002");
        }
        return problems;
    }
    private WorkbenchPlanReviewPolicy(){}
}
