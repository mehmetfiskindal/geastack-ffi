package com.geastack;

public class GeaAndroidRuntimeTest {
    static {
        System.loadLibrary("gea_android_runtime_test");
    }

    public static int javaAdd(int a, int b) {
        return a + b;
    }

    public static String javaGreet(String name) {
        return "hello " + name;
    }

    public static native int bridgeAdd(int a, int b);

    public static native String bridgeGreet(String name);

    public static void main(String[] args) {
        int sum = bridgeAdd(19, 23);
        String greeting = bridgeGreet("GeaStack");
        System.out.println("bridgeAdd=" + sum);
        System.out.println("bridgeGreet=" + greeting);
        if (sum != 42 || !"hello GeaStack".equals(greeting)) {
            throw new RuntimeException("android_jni_runtime failed");
        }
        System.out.println("android_jni_runtime ok");
    }
}
