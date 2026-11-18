using System;
using System.Threading.Tasks;

// Windows PowerShell 5.1 Console.In.ReadLineAsync can block synchronously.
// Keep the blocking pipe read on a CLR task, not on the serial polling thread.
public static class SchoveraSerialInput
{
    public static Task<string> Next()
    {
        return Task.Run(() => Console.ReadLine());
    }
}
