package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class WorkbenchPlanReviewPolicyTest {
    private static final long NOW=WorkbenchSchedulePolicy.instant("2026-10-09T00:00:00Z");
    private static final String START="2026-10-09T08:00:00Z",END="2026-10-09T09:00:00Z";
    private static final String BEFORE="2026-10-09 07:00:00",BEFORE_END="2026-10-09 08:00:00";
    private WorkbenchPlanReviewPolicy.Operation create(String id,String start,String end){
        return new WorkbenchPlanReviewPolicy.Operation("create",id,"Study",start,end,"","","");
    }
    private WorkbenchPlanReviewPolicy.Operation update(String id,String beforeId,String beforeStart){
        return new WorkbenchPlanReviewPolicy.Operation("update",id,"Study",START,END,beforeId,beforeStart,BEFORE_END);
    }
    private boolean valid(List<WorkbenchPlanReviewPolicy.Operation> ops,Set<String> selected,Set<String> editable){
        return WorkbenchPlanReviewPolicy.problems(ops,selected,editable,NOW).isEmpty();
    }
    @Test public void scopeMustBeCurrentAndWellFormed(){
        String scope="a".repeat(64);
        assertTrue(WorkbenchPlanReviewPolicy.scopeMatches(scope,scope));
        assertFalse(WorkbenchPlanReviewPolicy.scopeMatches(scope,"b".repeat(64)));
        assertFalse(WorkbenchPlanReviewPolicy.scopeMatches("",""));
        assertFalse(WorkbenchPlanReviewPolicy.scopeMatches(null,scope));
    }
    @Test public void freshnessUsesMonotonicBoundaries(){
        assertTrue(WorkbenchPlanReviewPolicy.contextFresh(1000,301000));
        assertFalse(WorkbenchPlanReviewPolicy.contextFresh(1000,301001));
        assertFalse(WorkbenchPlanReviewPolicy.contextFresh(0,1));
        assertFalse(WorkbenchPlanReviewPolicy.contextFresh(1000,999));
    }
    @Test public void validIdsExcludeControlOrOversizedData(){
        assertTrue(WorkbenchPlanReviewPolicy.safeId("schedule-123"));
        assertFalse(WorkbenchPlanReviewPolicy.safeId("a".repeat(80)));
        assertFalse(WorkbenchPlanReviewPolicy.safeId("user\nprivate"));
        assertFalse(WorkbenchPlanReviewPolicy.safeId(null));
    }
    @Test public void ambiguousAndInvalidChoicesAreNotShareable(){
        assertEquals(new LinkedHashSet<>(Arrays.asList("one","three")),
            WorkbenchPlanReviewPolicy.unambiguousIds(Arrays.asList("one","two","two","three","bad id",null)));
    }
    @Test public void selectedIdsMustBeUniqueAvailableAndBounded(){
        assertTrue(WorkbenchPlanReviewPolicy.selectionValid(Arrays.asList("one"),Set.of("one")));
        assertFalse(WorkbenchPlanReviewPolicy.selectionValid(Arrays.asList("one","one"),Set.of("one")));
        assertFalse(WorkbenchPlanReviewPolicy.selectionValid(Arrays.asList("missing"),Set.of("one")));
        assertFalse(WorkbenchPlanReviewPolicy.selectionValid(Collections.nCopies(9,"one"),Set.of("one")));
    }
    @Test public void createsDoNotRequireCalendarSharing(){
        assertTrue(valid(List.of(create("new",START,END)),Set.of(),Set.of()));
    }
    @Test public void futureSelectedEditableUpdateSupportsSqlBeforeDates(){
        assertTrue(valid(List.of(update("old","old",BEFORE)),Set.of("old"),Set.of("old")));
    }
    @Test public void unselectedUpdateIsRejected(){
        assertFalse(valid(List.of(update("old","old",BEFORE)),Set.of(),Set.of("old")));
    }
    @Test public void referenceOnlyUpdateIsRejected(){
        assertFalse(valid(List.of(update("old","old",BEFORE)),Set.of("old"),Set.of()));
    }
    @Test public void updateBeforeIdentityMustMatch(){
        assertFalse(valid(List.of(update("old","different",BEFORE)),Set.of("old"),Set.of("old")));
    }
    @Test public void missingBeforeTimestampIsRejected(){
        assertFalse(valid(List.of(update("old","old","")),Set.of("old"),Set.of("old")));
    }
    @Test public void startedBeforeItemCannotBeUpdated(){
        assertFalse(valid(List.of(update("old","old","2026-10-09T00:00:00Z")),Set.of("old"),Set.of("old")));
    }
    @Test public void newOperationRequiresExplicitSupportedTimezone(){
        assertFalse(valid(List.of(create("new","2026-10-09 08:00:00","2026-10-09 09:00:00")),Set.of(),Set.of()));
        assertFalse(valid(List.of(create("new","2026-10-09T08:00:00+05:00","2026-10-09T09:00:00+05:00")),Set.of(),Set.of()));
        assertTrue(valid(List.of(create("new","2026-10-09T16:00:00+08:00","2026-10-09T17:00:00+08:00")),Set.of(),Set.of()));
    }
    @Test public void pastAfterTimeIsRejected(){
        assertFalse(valid(List.of(create("new","2026-10-08T23:00:00Z",END)),Set.of(),Set.of()));
    }
    @Test public void reversedAndTooLongTimesAreRejected(){
        assertFalse(valid(List.of(create("new",END,START)),Set.of(),Set.of()));
        assertFalse(valid(List.of(create("new",START,"2026-10-09T21:00:00Z")),Set.of(),Set.of()));
    }
    @Test public void createCannotPretendToHaveBeforeRecord(){
        WorkbenchPlanReviewPolicy.Operation op=new WorkbenchPlanReviewPolicy.Operation("create","new","Study",START,END,"old",BEFORE,BEFORE_END);
        assertFalse(valid(List.of(op),Set.of("old"),Set.of("old")));
    }
    @Test public void deletionOrUnknownActionIsRejected(){
        WorkbenchPlanReviewPolicy.Operation op=new WorkbenchPlanReviewPolicy.Operation("delete","old","Study",START,END,"old",BEFORE,BEFORE_END);
        assertFalse(valid(List.of(op),Set.of("old"),Set.of("old")));
    }
    @Test public void duplicateIdsAndOverlappingItemsAreRejected(){
        assertFalse(valid(List.of(create("new",START,END),create("new",END,"2026-10-09T10:00:00Z")),Set.of(),Set.of()));
        assertFalse(valid(List.of(create("one",START,END),create("two","2026-10-09T08:30:00Z","2026-10-09T09:30:00Z")),Set.of(),Set.of()));
    }
    @Test public void adjacentItemsDoNotOverlap(){
        assertTrue(valid(List.of(create("one",START,END),create("two",END,"2026-10-09T10:00:00Z")),Set.of(),Set.of()));
    }
    @Test public void emptyOversizedAndMalformedPlansAreRejected(){
        assertFalse(valid(Collections.emptyList(),Set.of(),Set.of()));
        assertFalse(valid(Collections.nCopies(9,create("new",START,END)),Set.of(),Set.of()));
        WorkbenchPlanReviewPolicy.Operation empty=new WorkbenchPlanReviewPolicy.Operation("create","new","",START,END,"","","");
        assertFalse(valid(List.of(empty),Set.of(),Set.of()));
        assertFalse(valid(Arrays.asList((WorkbenchPlanReviewPolicy.Operation)null),Set.of(),Set.of()));
    }
}
