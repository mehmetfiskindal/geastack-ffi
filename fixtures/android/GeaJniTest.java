public class GeaJniTest {
    private final int base;

    public GeaJniTest() {
        this(0);
    }

    public GeaJniTest(int base) {
        this.base = base;
    }

    public static int add(int a, int b) {
        return a + b;
    }

    public static long addLong(long a, long b) {
        return a + b;
    }

    public static double half(double value) {
        return value / 2.0;
    }

    public static boolean negate(boolean value) {
        return !value;
    }

    public static String greet(String name) {
        return "hello " + name + " 🌍";
    }

    public static byte[] reverse(byte[] input) {
        byte[] output = new byte[input.length];
        for (int i = 0; i < input.length; i++) {
            output[i] = input[input.length - 1 - i];
        }
        return output;
    }

    public static int boom() {
        throw new IllegalStateException("intentional GeaJNI failure");
    }

    public int instanceAdd(int value) {
        return base + value;
    }

    public String instanceName() {
        return "instance-" + base;
    }
}
