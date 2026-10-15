package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkbenchMotionPolicyTest {
    @Test public void progressIsBoundedAndEmptyIsNotComplete() {
        assertEquals(0f, WorkbenchMotionPolicy.progress(0,0), 0f);
        assertEquals(0f, WorkbenchMotionPolicy.progress(-1,5), 0f);
        assertEquals(.4f, WorkbenchMotionPolicy.progress(2,5), .0001f);
        assertEquals(1f, WorkbenchMotionPolicy.progress(6,5), 0f);
    }
    @Test public void snappingUsesNearestExistingCardWithoutChangingData() {
        assertEquals(0, WorkbenchMotionPolicy.snap(-10,300,3));
        assertEquals(300, WorkbenchMotionPolicy.snap(170,300,3));
        assertEquals(600, WorkbenchMotionPolicy.snap(5000,300,3));
        assertEquals(0, WorkbenchMotionPolicy.snap(150,0,3));
        assertEquals(0, WorkbenchMotionPolicy.snap(150,300,0));
    }
}
